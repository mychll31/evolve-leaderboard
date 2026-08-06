export default function NoSeasonPage() {
  return (
    <main className="bg-surface flex min-h-dvh items-center justify-center p-6">
      <div className="border-line bg-card max-w-md rounded-[22px] border p-8 text-center">
        <div className="text-[40px]">🏀</div>
        <h1 className="font-display text-ink mt-3 text-[34px] leading-none font-extrabold">
          NO ACTIVE SEASON
        </h1>
        <p className="text-ink-2 mt-3 text-[14px] leading-relaxed">
          Leaderboard needs an active season before the leaderboard can be shown. A
          Super Admin can open one from the admin console.
        </p>
      </div>
    </main>
  );
}
