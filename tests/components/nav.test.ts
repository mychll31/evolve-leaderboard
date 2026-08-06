import { describe, expect, it } from "vitest";
import { buildNav, titleFor } from "@/components/shell/nav";

describe("shell navigation", () => {
  it("keeps analytics out of the shared member and coach nav", () => {
    expect(buildNav({ isAdmin: false, isCoach: false }).map((i) => i.href)).not.toContain(
      "/analytics",
    );
    expect(buildNav({ isAdmin: false, isCoach: true }).map((i) => i.href)).not.toContain(
      "/analytics",
    );
  });

  it("labels admin analytics inside the admin section", () => {
    expect(titleFor("/admin/analytics", true, true)).toBe("Season Analytics");
  });

  it("folds Hall of Fame into the leaderboard route", () => {
    const hrefs = buildNav({ isAdmin: true, isCoach: true }).map((i) => i.href);

    expect(hrefs).toContain("/leaderboard");
    expect(hrefs).not.toContain("/hall-of-fame");
    expect(titleFor("/leaderboard", true, true)).toBe(
      "Leaderboard & Hall of Fame",
    );
  });
});
