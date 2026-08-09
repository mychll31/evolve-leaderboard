import clsx from "clsx";

/** Shared primitives. Presentation only — none of these touch data. */

export function Card({
  className,
  children,
  ...rest
}: React.ComponentProps<"div">) {
  return (
    <div
      {...rest}
      className={clsx(
        "border-line bg-card rounded-[20px] border p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "font-display text-ink text-[18px] font-bold tracking-[0.12em] sm:text-[20px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "text-ink-3 text-[10px] font-extrabold tracking-[0.16em] uppercase",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Big condensed number — the design's signature element. */
export function DisplayNumber({
  children,
  className,
  ...rest
}: React.ComponentProps<"div">) {
  return (
    <div
      {...rest}
      className={clsx(
        "font-display leading-none font-extrabold tabular-nums",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Avatar({
  initials,
  color,
  size = 40,
  className,
}: {
  initials: string;
  color: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={clsx(
        "font-display flex shrink-0 items-center justify-center font-extrabold text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: color,
        borderRadius: Math.round(size * 0.29),
        fontSize: Math.round(size * 0.39),
      }}
    >
      {initials}
    </div>
  );
}

export function ProgressBar({
  value,
  color,
  gradient,
  height = 8,
  className,
}: {
  /** 0-100. */
  value: number;
  color?: string;
  gradient?: boolean;
  height?: number;
  className?: string;
}) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div
      className={clsx("bg-line-2 overflow-hidden rounded-full", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(width)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{
          width: `${width}%`,
          background: gradient
            ? "linear-gradient(90deg,#12B5CB,#5FD3E0)"
            : (color ?? "var(--color-primary)"),
        }}
      />
    </div>
  );
}

/**
 * Rank movement since the last weekly snapshot. A dash rather than a zero
 * when nothing changed, matching the design.
 */
export function Delta({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const label = value > 0 ? `▲${value}` : value < 0 ? `▼${Math.abs(value)}` : "–";
  const tone =
    value > 0 ? "text-positive" : value < 0 ? "text-negative" : "text-ink-4";
  const description =
    value > 0
      ? `up ${value}`
      : value < 0
        ? `down ${Math.abs(value)}`
        : "unchanged";

  return (
    <span className={clsx("text-[12px] font-extrabold", tone, className)}>
      <span aria-hidden>{label}</span>
      <span className="sr-only">{description}</span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  tone = "light",
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "light" | "onColor";
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-[14px] px-3 py-2.5 sm:px-4 sm:py-3",
        tone === "onColor"
          ? "border border-white/30 bg-white/20"
          : "bg-surface-2",
        className,
      )}
    >
      <div
        className={clsx(
          "text-[9.5px] font-extrabold tracking-[0.14em] uppercase",
          tone === "onColor" ? "text-white/85" : "text-ink-3",
        )}
      >
        {label}
      </div>
      <DisplayNumber
        className={clsx(
          "mt-0.5 text-[24px] sm:text-[28px]",
          tone === "onColor" ? "text-white" : "text-ink",
        )}
      >
        {value}
      </DisplayNumber>
    </div>
  );
}

/** Rank colouring: gold for first, teal for the podium, grey beyond. */
export function rankColor(rank: number): string {
  if (rank === 1) return "var(--color-accent)";
  if (rank <= 3) return "var(--color-primary)";
  return "var(--color-ink-3)";
}

export const fmt = {
  score: (n: number) => n.toFixed(1),
  /**
   * A member's overall score, always shown as a percentage.
   *
   * Every active metric is clamped to 0-100, then the member's total is the
   * equal average of those values.
   *
   * NOT for team points, which are a sum of member scores and have no ceiling.
   */
  total: (n: number) => `${n.toFixed(1)}%`,
  pct: (n: number) => `${Math.round(n)}%`,
  points: (n: number) => Math.round(n).toLocaleString(),
};
