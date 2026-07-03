"use client";

export function Marquee({ items }: { items: string[] }) {
  const doubled = [...items, ...items];
  return (
    <div
      className="relative overflow-hidden py-4 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]"
      style={{ perspective: "900px" }}
    >
      <div
        className="flex w-max animate-marquee gap-3"
        style={{ transform: "rotateX(14deg)", transformStyle: "preserve-3d" }}
      >
        {doubled.map((item, i) => (
          <span
            key={i}
            className="whitespace-nowrap rounded-pill border border-line bg-bg-800 px-4 py-2 text-sm text-text-hi shadow-lift transition-transform hover:-translate-y-0.5"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
