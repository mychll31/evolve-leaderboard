import { describe, expect, it } from "vitest";
import { buildNav, titleFor } from "@/components/shell/nav";

describe("shell navigation", () => {
  it("labels the dashboard plainly", () => {
    expect(titleFor("/dashboard", false, false)).toBe("Dashboard");
  });

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

  it("does not expose removed season and calendar admin headings", () => {
    expect(titleFor("/admin/seasons", true, true)).toBe("Metric Builder");
    expect(titleFor("/admin/calendar", true, true)).toBe("Metric Builder");
  });

  it("keeps Hall of Fame hidden from leaderboard navigation", () => {
    const hrefs = buildNav({ isAdmin: true, isCoach: true }).map((i) => i.href);

    expect(hrefs).toContain("/leaderboard");
    expect(hrefs).not.toContain("/hall-of-fame");
    expect(titleFor("/leaderboard", true, true)).toBe("Player Leaderboard");
  });

  it("gives every role the report, on the phone bar as well", () => {
    const member = buildNav({ isAdmin: false, isCoach: false });
    const admin = buildNav({ isAdmin: true, isCoach: true });

    expect(member.map((i) => i.href)).toContain("/report");
    expect(admin.map((i) => i.href)).toContain("/report");
    expect(member.find((i) => i.href === "/report")!.phone).toBe(true);
    expect(admin.find((i) => i.href === "/report")!.phone).toBe(true);
    expect(titleFor("/report", false, false)).toBe("Report");

    // A member's phone bar stays inside the five columns the design assumes.
    // An admin who also leads a team is past it — that predates the report and
    // is recorded here so narrowing it stays a deliberate change.
    expect(member.filter((i) => i.phone).length).toBeLessThanOrEqual(5);
    expect(admin.filter((i) => i.phone).length).toBe(6);
  });

  it("keeps notifications out of the menu while preserving the route title", () => {
    const hrefs = buildNav({ isAdmin: true, isCoach: true }).map((i) => i.href);

    expect(hrefs).not.toContain("/notifications");
    expect(titleFor("/notifications", true, true)).toBe("Notifications");
  });
});
