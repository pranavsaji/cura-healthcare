import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { allSlugs, getPost } from "@/lib/journal";
import { SITE } from "@/lib/site";

/** Pre-render every post at build; ISR keeps them fresh (revalidate hourly). */
export const dynamicParams = false;
export const revalidate = 3600;

export function generateStaticParams(): { slug: string }[] {
  return allSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/journal/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: `/journal/${post.slug}`,
      publishedTime: post.date,
      authors: [post.author],
      tags: post.tags,
    },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Organization", name: post.author },
    publisher: { "@type": "Organization", name: SITE.name },
    mainEntityOfPage: `${SITE.domain}/journal/${post.slug}`,
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <article className="mx-auto max-w-2xl px-6 pb-24 pt-40">
        <Link href="/journal" className="text-sm text-mint-400 hover:underline">
          ← Journal
        </Link>
        <div className="mt-6 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-text-mid">
          <time dateTime={post.date}>{post.date}</time>
          <span>·</span>
          <span>{post.readingMinutes} min read</span>
        </div>
        <h1 className="mt-4 font-display text-4xl font-light leading-tight text-text-hi md:text-5xl">
          {post.title}
        </h1>
        <p className="mt-4 text-lg text-text-mid">{post.description}</p>

        <div className="mt-10 space-y-6">
          {post.body.map((block, i) => {
            if (block.type === "h2") {
              return (
                <h2 key={i} className="font-display text-2xl font-light text-text-hi">
                  {block.text}
                </h2>
              );
            }
            if (block.type === "ul") {
              return (
                <ul key={i} className="list-disc space-y-2 pl-6 text-text-mid">
                  {block.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              );
            }
            return (
              <p key={i} className="leading-relaxed text-text-mid">
                {block.text}
              </p>
            );
          })}
        </div>
      </article>
    </main>
  );
}
