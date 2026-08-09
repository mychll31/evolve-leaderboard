"use client";

import { useState } from "react";
import { DisplayNumber, fmt } from "@/components/ui";
import type { MemberStanding } from "@/db/queries/standings";
import type { BadgeView } from "@/db/queries/badges";

export type LogRow = { label: string; value: string; tone?: "accent" };

/**
 * The player card from the phone design: tap to flip between stats and the
 * season log. Uses a real 3D rotation rather than a crossfade, which is what
 * makes it feel like a trading card.
 */
export function FlipCard({
  member,
  log,
  badges,
}: {
  member: MemberStanding;
  log: LogRow[];
  badges: BadgeView[];
}) {
  const [flipped, setFlipped] = useState(false);
  const owned = badges.filter((b) => b.owned);

  return (
    <div className="[perspective:1400px]">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-pressed={flipped}
        aria-label={flipped ? "Show player stats" : "Show season log"}
        className="relative block h-[400px] w-full cursor-pointer text-left [transform-style:preserve-3d] transition-transform duration-700 sm:h-[500px]"
        style={{
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          transitionTimingFunction: "cubic-bezier(.3,.8,.3,1)",
        }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 overflow-hidden rounded-[26px] p-6 [backface-visibility:hidden]"
          style={{
            background: `linear-gradient(150deg, ${member.teamColor} 0%, #0B7F92 58%, #F97316 150%)`,
            boxShadow: "0 20px 40px -22px rgba(11,127,146,.8)",
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(280px 200px at 90% 10%, rgba(255,255,255,.3), transparent 70%)",
            }}
          />
          <div className="relative flex items-start justify-between">
            <span className="text-[10px] font-extrabold tracking-[0.2em] text-white/80">
              PLAYER CARD
            </span>
            <span className="text-[10px] font-extrabold tracking-[0.14em] text-[#FFE2CC]">
              RANK #{member.rank}
            </span>
          </div>
          <div className="font-display relative mt-4 flex size-24 items-center justify-center rounded-[26px] bg-white/95 text-[40px] font-extrabold text-[#0B7F92]">
            {member.initials}
          </div>
          <DisplayNumber className="relative mt-3.5 text-[44px] text-white">
            {member.name}
          </DisplayNumber>
          <div className="relative mt-1.5 text-[12px] font-extrabold tracking-[0.12em] text-white/85">
            {member.teamName}
            {member.position ? ` · ${member.position}` : ""}
          </div>
          <div className="relative mt-5 grid grid-cols-4 gap-2">
            <CardStat label="Score" value={fmt.total(member.score)} />
            {member.breakdown.slice(0, 2).map((b) => (
              <CardStat
                key={b.key}
                label={b.name.slice(0, 3)}
                value={Math.round(b.value).toString()}
              />
            ))}
            <CardStat label="Streak" value={member.streak.toString()} accent />
          </div>
        </div>

        {/* Back */}
        <div
          className="border-line bg-card absolute inset-0 flex flex-col overflow-hidden rounded-[26px] border p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]"
          style={{ boxShadow: "0 12px 30px -20px rgba(15,23,32,.4)" }}
        >
          <div className="text-ink-3 text-[10px] font-extrabold tracking-[0.2em] uppercase">
            Season log
          </div>
          <div className="mt-3.5 flex flex-col gap-2.5">
            {log.map((row) => (
              <div
                key={row.label}
                className="border-line-2 flex items-center justify-between border-b pb-2"
              >
                <span className="text-ink-2 text-[12.5px] font-bold">
                  {row.label}
                </span>
                <DisplayNumber
                  className={`text-[20px] ${row.tone === "accent" ? "text-accent" : "text-ink"}`}
                >
                  {row.value}
                </DisplayNumber>
              </div>
            ))}
          </div>
          <div className="text-ink-3 mt-4 text-[10px] font-extrabold tracking-[0.2em] uppercase">
            Badges
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {owned.length === 0 && (
              <span className="text-ink-3 text-[12px] font-semibold">
                None earned yet.
              </span>
            )}
            {owned.map((b) => (
              <span
                key={b.id}
                className="border-line bg-surface-2 flex items-center gap-1.5 rounded-full border px-3 py-1.5"
              >
                <span className="text-[14px]">{b.icon}</span>
                <span className="text-ink-2 text-[11px] font-extrabold">
                  {b.name}
                </span>
              </span>
            ))}
          </div>
        </div>
      </button>
    </div>
  );
}

function CardStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/28 bg-white/18 px-2 py-2.5">
      <div className="text-[9px] font-extrabold tracking-[0.12em] text-white/80 uppercase">
        {label}
      </div>
      <DisplayNumber
        className={`mt-0.5 text-[22px] ${accent ? "text-[#FFE2CC]" : "text-white"}`}
      >
        {value}
      </DisplayNumber>
    </div>
  );
}
