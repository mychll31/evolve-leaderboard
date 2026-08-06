"use client";

import { useState } from "react";
import { Card, DisplayNumber, Eyebrow, SectionTitle } from "@/components/ui";
import { runRollupAction } from "@/app/actions/gamification";
import type { RollupResult } from "@/db/mutations/rollup";
import { Banner, Button, useAction } from "./controls";

export function RollupPanel({
  seasonId,
  seasonName,
  weekNo,
}: {
  seasonId: string;
  seasonName: string;
  weekNo: number;
}) {
  const { pending, error, act } = useAction();
  const [result, setResult] = useState<RollupResult | null>(null);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <SectionTitle>WEEKLY ROLLUP</SectionTitle>
          <p className="text-ink-3 mt-2 max-w-xl text-[12.5px] font-semibold">
            Snapshots the standings for week {weekNo} of {seasonName}, awards any
            newly-earned badges, picks the weekly MVPs and raises notifications.
            Safe to run repeatedly — re-running settles on the same result
            rather than duplicating anything.
          </p>
        </div>
        <Button
          disabled={pending}
          onClick={() =>
            act(async () => {
              const outcome = await runRollupAction(seasonId);
              if (outcome.ok && outcome.data) setResult(outcome.data);
              return outcome;
            })
          }
        >
          {pending ? "Running…" : "Run weekly rollup"}
        </Button>
      </div>

      {error && (
        <div className="mt-4">
          <Banner tone="error">{error}</Banner>
        </div>
      )}

      {result && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Week", value: result.weekNo },
            { label: "Snapshots", value: result.snapshots },
            { label: "Badges", value: result.badgesAwarded },
            { label: "MVPs", value: result.awards },
            { label: "Notices", value: result.notifications },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface-2 rounded-xl px-3.5 py-2.5">
              <Eyebrow>{stat.label}</Eyebrow>
              <DisplayNumber className="text-ink mt-0.5 text-[24px]">
                {stat.value}
              </DisplayNumber>
            </div>
          ))}
        </div>
      )}

      <p className="text-ink-4 mt-4 text-[11.5px] font-semibold">
        In production this also runs weekly via Vercel Cron, guarded by
        CRON_SECRET.
      </p>
    </Card>
  );
}
