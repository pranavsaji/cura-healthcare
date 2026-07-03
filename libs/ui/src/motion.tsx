/* ────────────────────────────────────────────────────────────────────
   Motion primitives — declarative wrappers so pages stay clean and the
   `prefers-reduced-motion` mandate is honoured in exactly one place. Every
   primitive collapses to a plain, static element when the user prefers
   reduced motion: no springs, no pointer listeners, no rAF.
   ──────────────────────────────────────────────────────────────────── */
import { useEffect, useRef, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import { cn } from "./primitives.js";
import { useReducedMotion } from "./hooks/use-reduced-motion.js";
import { springs, reveal, staggerContainer, pageTransition } from "./springs.js";

/* ── Reveal: blur-in on scroll into view ─────────────────────────────── */
export function MotionReveal({
  children,
  className,
  delay = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li" | "span";
}) {
  const reduced = useReducedMotion();
  const Comp = motion[as];
  if (reduced) {
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }
  return (
    <Comp
      className={className}
      variants={reveal}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ ...springs.smooth, delay }}
    >
      {children}
    </Comp>
  );
}

/** Container that staggers `<MotionReveal>` / variant children into view. */
export function MotionStagger({
  children,
  className,
  stagger = 0.06,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={staggerContainer(stagger, delay)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-10% 0px" }}
    >
      {children}
    </motion.div>
  );
}

/* ── MotionList / MotionItem: reduced-motion-safe stagger for real lists ──
   Unlike MotionStagger these render as the actual semantic element (ul, ol,
   tbody, tr, li…) so they can wrap tables and lists without invalid nesting. */
type ListTag = "ul" | "ol" | "div" | "tbody" | "dl";
type ItemTag = "li" | "tr" | "div";

export function MotionList({
  as = "ul",
  children,
  className,
  ariaLabel,
  stagger = 0.05,
}: {
  as?: ListTag;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  stagger?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    const Static = as;
    return (
      <Static className={className} aria-label={ariaLabel}>
        {children}
      </Static>
    );
  }
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      aria-label={ariaLabel}
      variants={staggerContainer(stagger)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-8% 0px" }}
    >
      {children}
    </Comp>
  );
}

export function MotionItem({
  as = "li",
  children,
  className,
}: {
  as?: ItemTag;
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }
  const Comp = motion[as];
  return (
    <Comp className={className} variants={reveal}>
      {children}
    </Comp>
  );
}

/* ── Tilt: pointer-driven CSS 3D perspective, spring-damped ───────────── */
export function Tilt({
  children,
  className,
  max = 8,
  glare = false,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  glare?: boolean;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), springs.smooth);
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), springs.smooth);
  const glareBg = useTransform(
    px,
    (v) => `radial-gradient(220px circle at ${v * 100}% 0%, rgba(255,255,255,0.35), transparent 60%)`,
  );

  if (reduced) return <div className={className}>{children}</div>;

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }
  function reset() {
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <motion.div
      ref={ref}
      className={cn("relative [transform-style:preserve-3d]", className)}
      style={{ perspective: 800, rotateX: rx, rotateY: ry }}
      onPointerMove={onMove}
      onPointerLeave={reset}
    >
      {children}
      {glare && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-40 mix-blend-soft-light"
          style={{ background: glareBg }}
        />
      )}
    </motion.div>
  );
}

/* ── Magnetic: element leans toward the cursor, springs home ──────────── */
export function Magnetic({
  children,
  className,
  strength = 0.3,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(useMotionValue(0), springs.snappy);
  const y = useSpring(useMotionValue(0), springs.snappy);

  if (reduced) return <div className={className}>{children}</div>;

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  }
  function reset() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      ref={ref}
      className={cn("inline-block", className)}
      style={{ x, y }}
      onPointerMove={onMove}
      onPointerLeave={reset}
    >
      {children}
    </motion.div>
  );
}

/* ── Parallax: pointer-driven layered depth ───────────────────────────── */
export function Parallax({
  children,
  className,
  depth = 20,
}: {
  children: ReactNode;
  className?: string;
  depth?: number;
}) {
  const reduced = useReducedMotion();
  const x = useSpring(useMotionValue(0), springs.lazy);
  const y = useSpring(useMotionValue(0), springs.lazy);

  if (reduced) return <div className={className}>{children}</div>;

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    x.set(((e.clientX - r.left) / r.width - 0.5) * depth);
    y.set(((e.clientY - r.top) / r.height - 0.5) * depth);
  }
  function reset() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div className={className} style={{ x, y }} onPointerMove={onMove} onPointerLeave={reset}>
      {children}
    </motion.div>
  );
}

/* ── PageTransition: route enter/exit choreography ────────────────────── */
export function PageTransition({ id, children }: { id: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced) return <div>{children}</div>;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={id}
        variants={pageTransition}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/* ── CountUp: spring-animated number ──────────────────────────────────── */
export function CountUp({
  value,
  className,
  format = (n: number) => Math.round(n).toString(),
}: {
  value: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const reduced = useReducedMotion();
  const spring = useSpring(0, springs.smooth);
  const text = useTransform(spring, format);
  useEffect(() => {
    if (!reduced) spring.set(value);
  }, [value, reduced, spring]);
  if (reduced) return <span className={className}>{format(value)}</span>;
  return <motion.span className={className}>{text}</motion.span>;
}
