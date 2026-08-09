import { fmt } from "@/components/ui";
import type { MemberStanding } from "@/db/queries/standings";

/**
 * The top three on a podium.
 *
 * Colour follows the *place*, not the team — first is teal, second orange,
 * third purple — so the ranking reads instantly even when two of the three
 * come from the same team.
 *
 * Placed 2 · 1 · 3 with the blocks at differing heights, so the shape carries
 * the ranking on its own. On a phone the three stay side by side and shrink,
 * because a stacked podium is not a podium.
 */

type Place = {
  color: string;
  /** Literal class strings: Tailwind cannot see classes built at runtime. */
  avatar: string;
  block: string;
};

const PLACES: Record<number, Place> = {
  1: {
    color: "#12B5CB",
    avatar: "size-[52px] text-[19px] sm:size-[62px] sm:text-[23px]",
    block: "h-[104px] sm:h-[132px]",
  },
  2: {
    color: "#F97316",
    avatar: "size-[44px] text-[16px] sm:size-[52px] sm:text-[19px]",
    block: "h-[74px] sm:h-[96px]",
  },
  3: {
    color: "#7C3AED",
    avatar: "size-[44px] text-[16px] sm:size-[52px] sm:text-[19px]",
    block: "h-[62px] sm:h-[82px]",
  },
};

/** Fixed, not random — a random scatter would differ between server and client. */
const SPECKS = [
  { left: "6%", top: "18%", size: 7, color: "#F97316" },
  { left: "14%", top: "58%", size: 5, color: "#12B5CB" },
  { left: "27%", top: "10%", size: 6, color: "#7C3AED" },
  { left: "46%", top: "6%", size: 5, color: "#F5B841" },
  { left: "62%", top: "14%", size: 6, color: "#12B5CB" },
  { left: "78%", top: "50%", size: 5, color: "#F97316" },
  { left: "88%", top: "22%", size: 7, color: "#7C3AED" },
  { left: "95%", top: "62%", size: 5, color: "#12B5CB" },
];

function Entrant({ member, place }: { member: MemberStanding; place: number }) {
  const spec = PLACES[place] ?? PLACES[3];

  return (
    <div className="flex min-w-0 flex-col items-center justify-end">
      {place === 1 && (
        <div
          aria-hidden
          className="mb-1 text-[22px] leading-none sm:text-[26px]"
        >
          👑
        </div>
      )}

      <div className="relative">
        <div
          className={`font-display flex items-center justify-center rounded-full font-extrabold text-white ${spec.avatar}`}
          style={{
            background: spec.color,
            boxShadow: `0 10px 22px -12px ${spec.color}`,
          }}
        >
          {member.initials}
        </div>
        <span
          aria-hidden
          className="font-display border-card absolute -bottom-2 left-1/2 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border-2 bg-[#DCE7EF] text-[11px] font-extrabold text-[#41525F]"
        >
          {place}
        </span>
      </div>

      <div className="mt-3.5 w-full min-w-0 text-center">
        <div className="text-ink truncate text-[13px] font-extrabold sm:text-[15px]">
          {member.name}
        </div>
        <div className="text-ink-3 truncate text-[10.5px] font-semibold sm:text-[12px]">
          {member.teamName}
          {member.position ? ` · ${member.position}` : ""}
        </div>
      </div>

      <span
        className="border-line-2 mt-2 rounded-full border bg-white px-2.5 py-1 text-[12px] font-extrabold sm:px-3 sm:text-[14px]"
        style={{ color: spec.color }}
      >
        {fmt.total(member.score)}
      </span>

      <div
        className={`relative mt-3 w-full max-w-[150px] rounded-t-[14px] ${spec.block}`}
        style={{
          background: `linear-gradient(180deg, ${spec.color} 0%, ${spec.color}D9 100%)`,
          boxShadow: `inset 0 6px 0 rgba(255,255,255,.18), 0 -6px 22px -14px ${spec.color}`,
        }}
      >
        <span className="font-display absolute inset-0 flex items-center justify-center text-[34px] font-extrabold text-white sm:text-[44px]">
          {place}
        </span>
      </div>
    </div>
  );
}

export function TopPerformers({ members }: { members: MemberStanding[] }) {
  // Place is the position on this board, not the season rank: filtered to two
  // teams, the best of those two is this podium's number one.
  const top = members
    .slice(0, 3)
    .map((member, index) => ({ member, place: index + 1 }));
  if (top.length === 0) return null;

  // 2 · 1 · 3, skipping the gaps when fewer than three are on the board.
  const staged = [top[1], top[0], top[2]].filter(Boolean);

  return (
    <div className="border-line bg-card relative overflow-hidden rounded-[22px] border px-4 pt-5 sm:px-8">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(420px 220px at 50% 0%, rgba(18,181,203,.12), transparent 70%)",
        }}
      />
      {SPECKS.map((speck) => (
        <span
          key={`${speck.left}-${speck.top}`}
          aria-hidden
          className="absolute rounded-full"
          style={{
            left: speck.left,
            top: speck.top,
            width: speck.size,
            height: speck.size,
            background: speck.color,
            opacity: 0.5,
          }}
        />
      ))}

      <div className="text-ink-3 relative text-center text-[10px] font-extrabold tracking-[0.18em] uppercase">
        Top performers
      </div>

      <ol className="relative mt-4 grid grid-cols-3 items-end gap-2 sm:gap-4">
        {staged.map((entry) => (
          <li key={entry.member.membershipId} className="min-w-0">
            <Entrant member={entry.member} place={entry.place} />
          </li>
        ))}
      </ol>
    </div>
  );
}
