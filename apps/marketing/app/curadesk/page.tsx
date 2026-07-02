import type { Metadata } from "next";
import { ProductPage } from "@/components/ProductPage";
import { PRODUCTS } from "@/lib/site";

const product = PRODUCTS.find((p) => p.slug === "curadesk")!;

export const metadata: Metadata = {
  title: `${product.name} — ${product.headline}`,
  description: product.body,
  alternates: { canonical: "/curadesk" },
  openGraph: { title: `${product.name} — ${product.headline}`, description: product.body, url: "/curadesk" },
};

export default function Page() {
  return <ProductPage product={product} />;
}
