"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";

/** Shared admin form primitives, so six screens do not each reinvent them. */

export const inputClass =
  "border-line bg-card text-ink w-full rounded-xl border px-3.5 py-2.5 text-[14px] font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("block", className)}>
      <span className="text-ink-3 block text-[10px] font-extrabold tracking-[0.14em] uppercase">
        {label}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {hint && (
        <span className="text-ink-3 mt-1 block text-[11.5px] font-medium">
          {hint}
        </span>
      )}
    </label>
  );
}

export function Button({
  variant = "primary",
  size = "default",
  className,
  ...rest
}: React.ComponentProps<"button"> & {
  variant?: "primary" | "ghost" | "danger";
  /** `compact` narrows a button down to a single glyph, such as ↑ / ↓. */
  size?: "default" | "compact";
}) {
  return (
    <button
      {...rest}
      // Padding belongs to the size, not the base: a `px-*` passed through
      // `className` cannot override a `px-*` already here — clsx concatenates,
      // and the stylesheet's order decides the winner, not the call site's.
      className={clsx(
        "cursor-pointer rounded-[10px] py-2.5 text-[11.5px] font-extrabold tracking-[0.06em] uppercase transition-colors disabled:cursor-default disabled:opacity-50",
        size === "default" && "px-4",
        size === "compact" && "px-2.5",
        variant === "primary" && "bg-primary text-white hover:bg-primary-dark",
        variant === "ghost" &&
          "border-line text-ink-2 hover:bg-surface-2 border bg-white",
        variant === "danger" &&
          "border-negative-line bg-negative-tint text-negative border",
        className,
      )}
    />
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: "error" | "success" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={clsx(
        "rounded-xl border px-4 py-3 text-[13px] leading-relaxed font-semibold",
        tone === "error" && "border-negative-line bg-negative-tint text-negative",
        tone === "success" &&
          "border-positive-line bg-positive-tint text-positive",
        tone === "warning" && "border-accent-line bg-accent-tint text-accent-dark",
      )}
    >
      {children}
    </div>
  );
}

export type ActionOutcome = { ok: boolean; error?: string };

/**
 * Wraps a server action call with pending state and error surfacing, which is
 * otherwise repeated in every admin form.
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const act = (
    fn: () => Promise<ActionOutcome>,
    options: { successMessage?: string; onDone?: () => void } = {},
  ) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      if (options.successMessage) setSuccess(options.successMessage);
      options.onDone?.();
    });
  };

  return { pending, error, success, act, setError, setSuccess };
}

export function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    active: "bg-positive-tint text-positive border-positive-line",
    draft: "bg-surface-2 text-ink-2 border-line",
    locked: "bg-accent-tint text-accent-dark border-accent-line",
    archived: "bg-surface-2 text-ink-3 border-line",
    scheduled: "bg-surface-2 text-ink-2 border-line",
    held: "bg-positive-tint text-positive border-positive-line",
    cancelled: "bg-negative-tint text-negative border-negative-line",
  };
  return (
    <span
      className={clsx(
        "rounded-full border px-2.5 py-1 text-[10px] font-extrabold tracking-[0.1em] uppercase",
        tone[status] ?? "bg-surface-2 text-ink-2 border-line",
      )}
    >
      {status}
    </span>
  );
}
