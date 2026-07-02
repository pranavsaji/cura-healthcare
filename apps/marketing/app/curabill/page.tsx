import type { Metadata } from "next";
import { ProductPage } from "@/components/ProductPage";
import { PRODUCTS } from "@/lib/site";

const product = PRODUCTS.find((p) => p.slug === "curabill")!;

export const metadata: Metadata = {
  title: `${product.name} — ${product.headline}`,
  description: product.body,
  alternates: { canonical: "/curabill" },
  openGraph: { title: `${product.name} — ${product.headline}`, description: product.body, url: "/curabill" },
};

export default function Page() {
  return <ProductPage product={product} />;
}
