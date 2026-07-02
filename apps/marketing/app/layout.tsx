import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { SiteFooter } from "@/components/SiteFooter";
import { SmoothScroll } from "@/components/SmoothScroll";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.domain),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s — ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "behavioral health AI",
    "ambient documentation",
    "AI medical scribe",
    "front-desk voice agent",
    "revenue cycle management",
    "HIPAA AI",
  ],
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    url: SITE.domain,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};

/** JSON-LD organization schema for rich results. */
function OrganizationJsonLd() {
  const json = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.domain,
    description: SITE.description,
    email: SITE.email,
    sameAs: [] as string[],
  };
  return (
    <script
      type="application/ld+json"
      // JSON-LD is static, non-user content serialized from a constant object.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <OrganizationJsonLd />
        <SmoothScroll />
        <Nav />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
