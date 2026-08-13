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
  /**
   * Geometry is inline `clamp()` rather than responsive classes: it scales
   * smoothly between a phone and a desktop with no breakpoint to land
   * awkwardly between, and it cannot break if the stylesheet is a build
   * behind — which is exactly how this podium once rendered with squashed
   * avatars and two missing blocks.
   */
  avatar: string;
  initials: string;
  block: string;
  numeral: string;
};

const PLACES: Record<number, Place> = {
  1: {
    color: "#12B5CB",
    avatar: "clamp(48px, 7vw, 62px)",
    initials: "clamp(17px, 2.5vw, 23px)",
    block: "clamp(96px, 14vw, 132px)",
    numeral: "clamp(30px, 4.6vw, 44px)",
  },
  2: {
    color: "#F97316",
    avatar: "clamp(42px, 6vw, 52px)",
    initials: "clamp(15px, 2.1vw, 19px)",
    block: "clamp(70px, 10vw, 96px)",
    numeral: "clamp(26px, 4vw, 38px)",
  },
  3: {
    color: "#7C3AED",
    avatar: "clamp(42px, 6vw, 52px)",
    initials: "clamp(15px, 2.1vw, 19px)",
    block: "clamp(60px, 8.6vw, 82px)",
    numeral: "clamp(26px, 4vw, 38px)",
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
        {member.image ? (
          <img
            src={member.image}
            alt=""
            aria-hidden
            className="shrink-0 rounded-full object-cover"
            style={{
              width: spec.avatar,
              height: spec.avatar,
              background: spec.color,
              boxShadow: `0 10px 22px -12px ${spec.color}`,
            }}
          />
        ) : (
          <div
            className="font-display flex shrink-0 items-center justify-center rounded-full font-extrabold text-white"
            style={{
              width: spec.avatar,
              height: spec.avatar,
              fontSize: spec.initials,
              background: spec.color,
              boxShadow: `0 10px 22px -12px ${spec.color}`,
            }}
          >
            {member.initials}
          </div>
        )}
        {/* Geometry inline, like the avatar and the block: Safari was left
            with a stylesheet where `size-6` had not been generated and drew
            this as a tall capsule beside the name. */}
        <span
          aria-hidden
          className="font-display font-extrabold"
          style={{
            position: "absolute",
            bottom: -8,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 9999,
            border: "2px solid var(--color-card)",
            background: "#DCE7EF",
            color: "#41525F",
            fontSize: 11,
            lineHeight: 1,
          }}
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
        className="relative mt-3 w-full"
        style={{
          height: spec.block,
          maxWidth: 150,
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          background: `linear-gradient(180deg, ${spec.color} 0%, ${spec.color}D9 100%)`,
          boxShadow: `inset 0 6px 0 rgba(255,255,255,.18), 0 -6px 22px -14px ${spec.color}`,
        }}
      >
        <span
          className="font-display absolute inset-0 flex items-center justify-center font-extrabold text-white"
          style={{ fontSize: spec.numeral }}
        >
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
        Top 3 right now
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
