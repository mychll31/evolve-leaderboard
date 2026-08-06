/**
 * Pure CSV parsing and serialising.
 *
 * Deliberately hand-rolled rather than pulled from a dependency: the import
 * surface is one known shape, and the failure modes that actually bite
 * (quoted commas, CRLF from Excel, a UTF-8 BOM, trailing blank lines) are
 * cheaper to pin down with tests than to audit in a library.
 */

export type CsvRow = Record<string, string>;

export type ParsedCsv = {
  headers: string[];
  rows: CsvRow[];
};

/** Splits CSV text into a grid, honouring RFC 4180 quoting. */
export function parseCsv(input: string): string[][] {
  // Excel prepends a BOM; left in place it becomes part of the first header
  // name and every lookup for that column silently misses.
  const text = input.replace(/^﻿/, "");

  const grid: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    grid.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      endField();
      i++;
      continue;
    }
    if (char === "\r") {
      // Treat CRLF and a lone CR as one line break.
      endRow();
      i += text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      i++;
      continue;
    }

    field += char;
    i++;
  }

  // Only emit a trailing row if it holds something; a file ending in a newline
  // must not produce a phantom empty record.
  if (field.length > 0 || row.length > 0) endRow();

  return grid.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Parses into objects keyed by lower-cased, trimmed header names. */
export function parseCsvRows(input: string): ParsedCsv {
  const grid = parseCsv(input);
  if (grid.length === 0) return { headers: [], rows: [] };

  const headers = grid[0].map((h) => h.trim().toLowerCase());
  const rows = grid.slice(1).map((cells) => {
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? "").trim();
    });
    return row;
  });

  return { headers, rows };
}

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map((cell) => escapeCell(String(cell))).join(",")),
  ];
  return lines.join("\r\n");
}

/* -------------------------------------------------------------------------
 * Member import
 * ---------------------------------------------------------------------- */

export const MEMBER_IMPORT_HEADERS = [
  "name",
  "email",
  "team",
  "position",
  "role",
] as const;

export type MemberImportRow = {
  /** 1-based, counting the header, so it matches what the admin sees. */
  line: number;
  name: string;
  email: string;
  team: string;
  position: string | null;
  role: "member" | "coach";
};

export type MemberImportIssue = {
  line: number;
  message: string;
};

export type MemberImportParse = {
  rows: MemberImportRow[];
  issues: MemberImportIssue[];
};

// Intentionally permissive: this rejects obvious typos without trying to be a
// full RFC 5322 validator, which would reject valid addresses.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates import text into rows plus per-line issues. Never writes; the
 * caller decides whether to apply, and refuses when any issue is present.
 */
export function parseMemberImport(input: string): MemberImportParse {
  const { headers, rows } = parseCsvRows(input);
  const issues: MemberImportIssue[] = [];

  if (rows.length === 0) {
    return { rows: [], issues: [{ line: 1, message: "No rows found" }] };
  }

  for (const required of ["name", "email", "team"] as const) {
    if (!headers.includes(required)) {
      issues.push({ line: 1, message: `Missing required column "${required}"` });
    }
  }
  if (issues.length > 0) return { rows: [], issues };

  const parsed: MemberImportRow[] = [];
  const seen = new Map<string, number>();

  rows.forEach((row, index) => {
    const line = index + 2; // header is line 1
    const name = row.name ?? "";
    const email = (row.email ?? "").toLowerCase();
    const team = row.team ?? "";
    const roleRaw = (row.role ?? "member").toLowerCase() || "member";

    if (!name) issues.push({ line, message: "Name is required" });
    if (!email) {
      issues.push({ line, message: "Email is required" });
    } else if (!EMAIL.test(email)) {
      issues.push({ line, message: `"${email}" is not a valid email address` });
    } else if (seen.has(email)) {
      issues.push({
        line,
        message: `Duplicate email — also on line ${seen.get(email)}`,
      });
    } else {
      seen.set(email, line);
    }
    if (!team) issues.push({ line, message: "Team is required" });
    if (roleRaw !== "member" && roleRaw !== "coach") {
      issues.push({
        line,
        message: `Role must be "member" or "coach", got "${roleRaw}"`,
      });
    }

    parsed.push({
      line,
      name,
      email,
      team,
      position: row.position ? row.position.toUpperCase() : null,
      role: roleRaw === "coach" ? "coach" : "member",
    });
  });

  return { rows: parsed, issues };
}
