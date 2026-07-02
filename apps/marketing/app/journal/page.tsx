import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/ui";
import { getAllPosts } from "@/lib/journal";

export const metadata: Metadata = {
  title: "Journal — Notes on AI operations for behavioral health",
  description:
    "Field notes on ambient documentation, front-desk voice agents, and revenue-cycle automation for behavioral health.",
  alternates: { canonical: "/journal" },
};

export default function Page() {
  const posts = getAllPosts();
  return (
    <main>
      <PageHero
        eyebrow="Journal"
        title="Field notes from the frontier."
        body="How we think about ambient AI operations for behavioral health — documentation, front desk, and billing."
      />

      <section className="mx-auto max-w-container px-6 py-12">
        <ul className="grid gap-4 md:grid-cols-2">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/journal/${post.slug}`}
                className="block h-full rounded-xl border border-line bg-bg-800/40 p-6 hover:border-line-strong"
              >
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-text-mid">
                  <time dateTime={post.date}>{post.date}</time>
                  <span>·</span>
                  <span>{post.readingMinutes} min read</span>
                </div>
                <h2 className="mt-3 font-display text-2xl font-light text-text-hi">{post.title}</h2>
                <p className="mt-2 text-sm text-text-mid">{post.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {post.tags.map((t) => (
                    <span key={t} className="rounded-pill border border-line px-2 py-0.5 text-[11px] text-text-mid">
                      {t}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
