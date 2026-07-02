import { createHash, createHmac } from "node:crypto";

/**
 * Minimal AWS Signature V4 for S3 — just enough to presign uploads and sign
 * direct object requests, with zero SDK dependency. Deterministic given a fixed
 * clock, so the presigner is unit-testable offline (canonical request → known
 * signature). Reference: AWS "Signature Version 4" signing process.
 */

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

const SERVICE = "s3";
const ALGORITHM = "AWS4-HMAC-SHA256";

/** AWS-strict percent-encoding (RFC 3986). `encodeSlash=false` preserves path `/`. */
export function awsUriEncode(input: string, encodeSlash = true): string {
  let out = "";
  for (const ch of Buffer.from(input, "utf8").toString("binary")) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) out += ch;
    else if (ch === "/") out += encodeSlash ? "%2F" : "/";
    else out += "%" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function signingKey(secret: string, dateStamp: string, region: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

function amzDate(now: Date): { amz: string; stamp: string } {
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz, stamp: amz.slice(0, 8) };
}

export interface PresignParams {
  method: "PUT" | "GET" | "DELETE";
  host: string; // e.g. bucket.s3.us-east-1.amazonaws.com
  region: string;
  key: string; // object key (no leading slash)
  credentials: AwsCredentials;
  expiresSec?: number;
  now: Date;
}

/**
 * Produce a presigned URL (query-string auth) for an object operation. The
 * caller uploads/downloads directly to S3 with this URL — the API never proxies
 * PHI bytes.
 */
export function presignUrl(params: PresignParams): string {
  const { amz, stamp } = amzDate(params.now);
  const scope = `${stamp}/${params.region}/${SERVICE}/aws4_request`;
  const canonicalUri = "/" + awsUriEncode(params.key.replace(/^\/+/, ""), false);

  const query: Record<string, string> = {
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": `${params.credentials.accessKeyId}/${scope}`,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(params.expiresSec ?? 900),
    "X-Amz-SignedHeaders": "host",
  };
  if (params.credentials.sessionToken) query["X-Amz-Security-Token"] = params.credentials.sessionToken;

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${awsUriEncode(k)}=${awsUriEncode(query[k]!)}`)
    .join("&");

  const canonicalHeaders = `host:${params.host}\n`;
  const canonicalRequest = [
    params.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [ALGORITHM, amz, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(params.credentials.secretAccessKey, stamp, params.region))
    .update(stringToSign, "utf8")
    .digest("hex");

  return `https://${params.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export interface SignedHeaders {
  headers: Record<string, string>;
}

/**
 * Sign a request with SigV4 header auth (for direct put/get/delete via `fetch`).
 * `payload` is hashed into the signature; extra headers (e.g. SSE-KMS) are signed.
 */
export function signRequest(params: {
  method: "PUT" | "GET" | "DELETE";
  host: string;
  region: string;
  key: string;
  credentials: AwsCredentials;
  payload: Buffer;
  extraHeaders?: Record<string, string>;
  now: Date;
}): Record<string, string> {
  const { amz, stamp } = amzDate(params.now);
  const scope = `${stamp}/${params.region}/${SERVICE}/aws4_request`;
  const canonicalUri = "/" + awsUriEncode(params.key.replace(/^\/+/, ""), false);
  const payloadHash = createHash("sha256").update(params.payload).digest("hex");

  const headers: Record<string, string> = {
    host: params.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
    ...(params.credentials.sessionToken ? { "x-amz-security-token": params.credentials.sessionToken } : {}),
    ...(params.extraHeaders ?? {}),
  };

  const sortedHeaderKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${String(headers[findKey(headers, k)]!).trim()}\n`).join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalRequest = [params.method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const stringToSign = [ALGORITHM, amz, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(params.credentials.secretAccessKey, stamp, params.region))
    .update(stringToSign, "utf8")
    .digest("hex");

  const authorization = `${ALGORITHM} Credential=${params.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { ...headers, Authorization: authorization };
}

function findKey(headers: Record<string, string>, lower: string): string {
  return Object.keys(headers).find((k) => k.toLowerCase() === lower) ?? lower;
}
