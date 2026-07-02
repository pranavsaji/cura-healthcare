import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Default social card. Uses only system fonts so the build stays hermetic. */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0e1512 0%, #1a2420 60%, #0e1512 100%)",
          color: "#f4f6f4",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 40, color: "#8fb89b", letterSpacing: 6 }}>CURA</div>
        <div style={{ fontSize: 68, lineHeight: 1.1, marginTop: 24, fontWeight: 300 }}>
          Ambient agents for behavioral health operations
        </div>
        <div style={{ fontSize: 30, color: "#9aa8a0", marginTop: 28 }}>
          Front desk · Documentation · RCM
        </div>
      </div>
    ),
    size,
  );
}
