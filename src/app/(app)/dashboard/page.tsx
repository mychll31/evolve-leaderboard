import { DisplayNumber, StatTile, fmt } from "@/components/ui";
import { MetricLogger } from "@/components/me/MetricLogger";
import { getDb } from "@/db/client";
import { getAppContext } from "@/db/queries/context";
import { getSelfLog } from "@/db/queries/member";

export default async function DashboardPage() {
  const ctx = await getAppContext();
  const { standings } = ctx;

  // Members can log from here as well as from their card; Leaders and admins
  // have no membership to log against, so they just see the standings.
  const selfLog = ctx.membershipId
    ? await getSelfLog(getDb(), standings.season.id, ctx.membershipId)
    : [];
  const ownStanding = ctx.membershipId
    ? standings.members.find((m) => m.membershipId === ctx.membershipId)
    : undefined;
  const loggedCount = selfLog.filter((row) => row.logged).length;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-[22px] p-6 sm:p-8"
        style={{
          background:
            "linear-gradient(112deg,#12B5CB 0%,#4ACBD9 44%,#F97316 122%)",
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(420px 220px at 84% 0%, rgba(255,255,255,.4), transparent 72%)",
          }}
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <DisplayNumber className="text-[44px] text-white sm:text-[64px]">
              Evolve - Leaderboard
            </DisplayNumber>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {ownStanding ? (
              <>
                <StatTile
                  tone="onColor"
                  label="Score"
                  value={fmt.total(ownStanding.score)}
                />
                <StatTile
                  tone="onColor"
                  label="Logged"
                  value={`${loggedCount}/${selfLog.length}`}
                />
                <StatTile
                  tone="onColor"
                  label="Rank"
                  value={`#${ownStanding.rank}`}
                />
              </>
            ) : (
              <>
                <StatTile
                  tone="onColor"
                  label="Top score"
                  value={fmt.total(standings.members[0]?.score ?? 0)}
                />
                <StatTile
                  tone="onColor"
                  label="Players"
                  value={standings.memberCount}
                />
                <StatTile
                  tone="onColor"
                  label="Teams"
                  value={standings.teamCount}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {ctx.membershipId && selfLog.length > 0 && (
        <MetricLogger membershipId={ctx.membershipId} rows={selfLog} />
      )}
    </div>
  );
}
