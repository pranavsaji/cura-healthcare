import { clsx, type ClassValue } from "clsx";
import { useId } from "react";
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from "react";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Uppercase letter-spaced section label with a leading tick. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-text-mid",
        className,
      )}
    >
      <span className="h-1 w-1 rounded-full bg-mint-400 shadow-glow" />
      {children}
    </span>
  );
}

type ChipTone = "live" | "processing" | "waiting" | "standby" | "done" | "danger";
const CHIP_TONES: Record<ChipTone, string> = {
  live: "text-mint-400 border-mint-400/30 bg-mint-400/10",
  processing: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  waiting: "text-text-mid border-line bg-white/5",
  standby: "text-text-lo border-line bg-white/5",
  done: "text-mint-400 border-mint-400/30 bg-mint-400/10",
  danger: "text-danger border-danger/30 bg-danger/10",
};

/** Floating status pill used on device mockups + the live pipeline. */
export function StatusChip({
  tone = "waiting",
  children,
}: {
  tone?: ChipTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-pill border px-3 py-1 text-[11px] font-medium uppercase tracking-wider",
        CHIP_TONES[tone],
      )}
    >
      {(tone === "live" || tone === "processing") && (
        <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-current" />
      )}
      {children}
    </span>
  );
}

/** Glassmorphic panel — the signature "device card" shell. */
export function GlassPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-line bg-bg-700/70 shadow-card backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
  /** Show a spinner + set `aria-busy`; the button is non-interactive while true. */
  loading?: boolean;
};

export function Button({
  variant = "primary",
  className,
  children,
  loading = false,
  disabled,
  type,
  ...rest
}: ButtonProps) {
  const styles: Record<NonNullable<ButtonProps["variant"]>, string> = {
    primary: "bg-mint-400 text-ink-900 hover:bg-mint-500 shadow-glow",
    ghost: "text-text-hi hover:bg-white/5",
    outline: "border border-line text-text-hi hover:border-line-strong hover:bg-white/5",
  };
  return (
    <button
      // Default to type="button" so a design-system button never accidentally
      // submits a form unless the caller opts in.
      type={type ?? "button"}
      aria-busy={loading || undefined}
      disabled={disabled ?? loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-pill px-5 py-2.5 text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint-400/60 disabled:cursor-not-allowed disabled:opacity-60",
        styles[variant],
        className,
      )}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      {children}
    </button>
  );
}

type FieldProps = {
  label: string;
  /** Error text; also wires `aria-invalid` + `aria-describedby` on the input. */
  error?: string;
  hint?: string;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;

/** Labelled text input with accessible error + hint wiring. */
export function Field({ label, error, hint, className, id, ...rest }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = cn(error && errorId, hint && hintId) || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-text-hi">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "rounded-md border border-line bg-bg-700/70 px-3 py-2 text-sm text-text-hi placeholder:text-text-lo",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-mint-400/60",
          error && "border-danger focus-visible:ring-danger/50",
        )}
        {...rest}
      />
      {hint && !error && (
        <span id={hintId} className="text-xs text-text-lo">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

/** A stat like "6,000+ / CLINICS". */
export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-3xl font-light text-text-hi">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-text-lo">{label}</div>
    </div>
  );
}
