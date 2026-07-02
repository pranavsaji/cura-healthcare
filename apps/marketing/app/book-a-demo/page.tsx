import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { DemoBooking } from "@/components/DemoBooking";

export const metadata: Metadata = {
  title: "Book a demo — See Cura in action",
  description:
    "See how Cura's ambient agents run front-desk, documentation, and RCM operations inside your existing stack.",
  alternates: { canonical: "/book-a-demo" },
};

export default function Page() {
  return (
    <main>
      <PageHero
        eyebrow="Book a demo"
        title="See it run in your stack."
        body="Pick a time and we'll walk you through Curanote, Curadesk, and Curabill on your systems."
      />
      <section className="mx-auto max-w-2xl px-6 pb-24">
        <DemoBooking />
      </section>
    </main>
  );
}
