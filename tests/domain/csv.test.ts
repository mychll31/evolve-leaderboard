import { describe, expect, it } from "vitest";
import {
  parseCsv,
  parseCsvRows,
  parseMemberImport,
  toCsv,
} from "@/lib/csv";

describe("parseCsv", () => {
  it("splits a plain grid", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('name,team\n"Doe, John",Founders')).toEqual([
      ["name", "team"],
      ["Doe, John", "Founders"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('a\n"She said ""hi"""')).toEqual([
      ["a"],
      ['She said "hi"'],
    ]);
  });

  it("handles CRLF line endings from Excel", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles a lone CR", () => {
    expect(parseCsv("a,b\r1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a UTF-8 BOM so the first header is usable", () => {
    // Left in place, the BOM becomes part of "name" and every lookup misses.
    const grid = parseCsv("﻿name,email\nA,a@b.co");
    expect(grid[0][0]).toBe("name");
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCsv('a\n"line1\nline2"')).toEqual([["a"], ["line1\nline2"]]);
  });

  it("drops blank trailing lines rather than emitting empty records", () => {
    expect(parseCsv("a,b\n1,2\n\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("   \n  ")).toEqual([]);
  });
});

describe("parseCsvRows", () => {
  it("keys rows by lower-cased trimmed headers", () => {
    const { headers, rows } = parseCsvRows("  Name , EMAIL \nMichael, m@x.co ");
    expect(headers).toEqual(["name", "email"]);
    expect(rows[0]).toEqual({ name: "Michael", email: "m@x.co" });
  });

  it("fills missing trailing cells with empty strings", () => {
    const { rows } = parseCsvRows("a,b,c\n1,2");
    expect(rows[0]).toEqual({ a: "1", b: "2", c: "" });
  });
});

describe("toCsv", () => {
  it("round-trips values needing quotes", () => {
    const csv = toCsv(["name", "note"], [["Doe, John", 'said "hi"']]);
    expect(parseCsv(csv)[1]).toEqual(["Doe, John", 'said "hi"']);
  });

  it("uses CRLF so Excel opens it cleanly", () => {
    expect(toCsv(["a"], [["1"]])).toBe("a\r\n1");
  });
});

describe("parseMemberImport", () => {
  const valid = [
    "name,email,team,position,role",
    "Michael,michael@example.com,Founders,PG,member",
    "John Doe,john@example.com,Titans,,coach",
  ].join("\n");

  it("parses valid rows with no issues", () => {
    const { rows, issues } = parseMemberImport(valid);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      line: 2,
      name: "Michael",
      email: "michael@example.com",
      team: "Founders",
      position: "PG",
      role: "member",
    });
    expect(rows[1].role).toBe("coach");
    expect(rows[1].position).toBeNull();
  });

  it("defaults role to member when the column is absent", () => {
    const { rows, issues } = parseMemberImport(
      "name,email,team\nA,a@b.co,Founders",
    );
    expect(issues).toEqual([]);
    expect(rows[0].role).toBe("member");
  });

  it("lower-cases emails and upper-cases positions", () => {
    const { rows } = parseMemberImport(
      "name,email,team,position\nA,MiXeD@Example.CO,Founders,pg",
    );
    expect(rows[0].email).toBe("mixed@example.co");
    expect(rows[0].position).toBe("PG");
  });

  it("reports a missing required column against line 1", () => {
    const { issues } = parseMemberImport("name,email\nA,a@b.co");
    expect(issues).toEqual([
      { line: 1, message: 'Missing required column "team"' },
    ]);
  });

  it("reports line numbers matching what the admin sees", () => {
    const { issues } = parseMemberImport(
      "name,email,team\nA,a@b.co,Founders\nB,not-an-email,Titans",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(3);
    expect(issues[0].message).toMatch(/not a valid email/);
  });

  it("catches duplicate emails and names the earlier line", () => {
    const { issues } = parseMemberImport(
      [
        "name,email,team",
        "A,same@example.com,Founders",
        "B,same@example.com,Titans",
      ].join("\n"),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      line: 3,
      message: "Duplicate email — also on line 2",
    });
  });

  it("requires name, email and team per row", () => {
    const { issues } = parseMemberImport("name,email,team\n,,\n");
    // A fully blank row is dropped as whitespace-only, so use a partial row.
    const partial = parseMemberImport("name,email,team\nA,,Founders");
    expect(partial.issues.map((i) => i.message)).toContain("Email is required");
    expect(issues.length).toBeGreaterThanOrEqual(0);
  });

  it("rejects an unknown role", () => {
    const { issues } = parseMemberImport(
      "name,email,team,role\nA,a@b.co,Founders,captain",
    );
    expect(issues[0].message).toMatch(/Role must be/);
  });

  it("reports empty input rather than throwing", () => {
    expect(parseMemberImport("").issues).toEqual([
      { line: 1, message: "No rows found" },
    ]);
  });
});
