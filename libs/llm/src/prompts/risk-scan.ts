import type { PromptTemplate } from "../registry.js";

/** Variables for the risk-scan prompt (safety flagging over a transcript). */
export interface RiskScanVars {
  transcript: { start: number; speaker: string; text: string }[];
}

const SYSTEM = `You are a behavioral-health safety reviewer. You scan a session transcript for indicators
that require clinical attention: suicidal ideation, homicidal ideation, abuse, or mandated-reporting
situations. You are conservative and precise: flag only clear textual indicators, quote the exact
supporting text, and never speculate beyond the transcript. Return an empty list if nothing is present.`;

export const riskScanPrompt: PromptTemplate<RiskScanVars> = {
  id: "risk-scan",
  version: 1,
  description: "Detect safety/risk indicators in a session transcript with supporting quotes.",
  system: SYSTEM,
  render: (v) => {
    const transcript = v.transcript
      .map((t) => `[${t.start.toFixed(1)}s] ${t.speaker}: ${t.text}`)
      .join("\n");
    return `Review the transcript for risk indicators. For each finding return: kind
(suicidal_ideation | homicidal_ideation | abuse | mandated_reporting), severity (info | warning |
critical), the exact supporting quote, and the segment start-time.

Transcript:
${transcript}`;
  },
};
