import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/journal";
import { SITE } from "@/lib/site";

/** Static routes + every journal post, absolute-URL'd for crawlers. */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/curanote",
    "/curadesk",
    "/curabill",
    "/security",
    "/integrations",
    "/careers",
    "/journal",
    "/book-a-demo",
  ].map((path) => ({
    url: `${SITE.domain}${path}`,
    changeFrequency: "monthly" as const,
    priority: path === "" ? 1 : 0.7,
  }));

  const posts = getAllPosts().map((post) => ({
    url: `${SITE.domain}/journal/${post.slug}`,
    lastModified: post.date,
    changeFrequency: "yearly" as const,
    priority: 0.5,
  }));

  return [...routes, ...posts];
}
