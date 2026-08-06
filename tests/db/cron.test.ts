import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The cron route rewrites every score in the season, so its authorisation is
 * worth testing directly rather than trusting the header comparison by eye.
 *
 * The route module is imported lazily inside each test so the mocked database
 * and environment are in place first.
 */
const runWeeklyRollup = vi.fn();

vi.mock("@/db/mutations/rollup", () => ({
  runWeeklyRollup,
  weekNoFor: () => 1,
}));

vi.mock("@/db/client", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: async () => [{ id: "season-1", name: "Leaderboard Season 1" }],
      }),
    }),
  }),
}));

async function callRoute(headers: Record<string, string> = {}) {
  const { GET } = await import("@/app/api/cron/rollup/route");
  return GET(new Request("http://localhost/api/cron/rollup", { headers }));
}

describe("GET /api/cron/rollup", () => {
  const original = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    runWeeklyRollup.mockReset();
    runWeeklyRollup.mockResolvedValue({
      weekNo: 1,
      members: 14,
      snapshots: 14,
      badgesAwarded: 2,
      awards: 4,
      notifications: 6,
    });
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("refuses outright when no secret is configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await callRoute({ authorization: "Bearer anything" });

    // An unprotected endpoint that rewrites every score is worse than a cron
    // that never fires, because the failure would be silent.
    expect(response.status).toBe(503);
    expect(runWeeklyRollup).not.toHaveBeenCalled();
  });

  it("rejects a missing authorization header", async () => {
    process.env.CRON_SECRET = "s3cret";
    const response = await callRoute();
    expect(response.status).toBe(401);
    expect(runWeeklyRollup).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    const response = await callRoute({ authorization: "Bearer wrong" });
    expect(response.status).toBe(401);
    expect(runWeeklyRollup).not.toHaveBeenCalled();
  });

  it("rejects the secret without its Bearer prefix", async () => {
    process.env.CRON_SECRET = "s3cret";
    const response = await callRoute({ authorization: "s3cret" });
    expect(response.status).toBe(401);
    expect(runWeeklyRollup).not.toHaveBeenCalled();
  });

  it("runs the rollup for the active season when authorised", async () => {
    process.env.CRON_SECRET = "s3cret";
    const response = await callRoute({ authorization: "Bearer s3cret" });

    expect(response.status).toBe(200);
    expect(runWeeklyRollup).toHaveBeenCalledTimes(1);

    const body = (await response.json()) as {
      ran: number;
      results: { season: string; badgesAwarded: number }[];
    };
    expect(body.ran).toBe(1);
    expect(body.results[0].season).toBe("Leaderboard Season 1");
    expect(body.results[0].badgesAwarded).toBe(2);
  });
});
