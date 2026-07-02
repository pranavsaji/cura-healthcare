import { ImageResponse } from "next/og";
import { allSlugs, getPost } from "@/lib/journal";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Pre-generate a per-post OG card at build for each journal slug. */
export function generateStaticParams(): { slug: string }[] {
  return allSlugs().map((slug) => ({ slug }));
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  const title = post?.title ?? SITE.name;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: "linear-gradient(135deg, #0e1512 0%, #1a2420 60%, #0e1512 100%)",
          color: "#f4f6f4",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 36, color: "#8fb89b", letterSpacing: 6 }}>CURA · JOURNAL</div>
        <div style={{ fontSize: 60, lineHeight: 1.12, fontWeight: 300 }}>{title}</div>
        <div style={{ fontSize: 28, color: "#9aa8a0" }}>{post?.date ?? ""}</div>
      </div>
    ),
    size,
  );
}
