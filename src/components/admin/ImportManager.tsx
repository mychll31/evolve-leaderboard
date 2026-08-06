"use client";

import { useState } from "react";
import { Card, DisplayNumber, Eyebrow, SectionTitle } from "@/components/ui";
import {
  applyImportAction,
  previewImportAction,
  type ImportPreview,
} from "@/app/actions/admin";
import { Banner, Button, useAction, inputClass } from "./controls";

const SAMPLE = `name,email,team,position,role
Ada Lovelace,ada@example.com,Founders,PG,member
Grace Hopper,grace@example.com,Titans,,coach`;

export function ImportManager({
  seasonId,
  teamNames,
  exportCsv,
}: {
  seasonId: string;
  teamNames: string[];
  exportCsv: string;
}) {
  const { pending, error, success, act, setError, setSuccess } = useAction();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const runPreview = () => {
    setPreview(null);
    act(async () => {
      const result = await previewImportAction(text);
      if (result.ok && result.data) setPreview(result.data);
      return result;
    });
  };

  const apply = () => {
    if (!preview) return;
    act(
      async () => {
        const result = await applyImportAction(seasonId, preview.rows);
        if (result.ok && result.data) {
          const { created, updated, errors } = result.data;
          if (errors.length > 0) {
            setPreview({ ...preview, issues: errors });
            return { ok: false, error: "Some rows could not be matched — nothing was imported." };
          }
          setSuccess(`Imported: ${created} created, ${updated} updated.`);
          setPreview(null);
          setText("");
        }
        return result;
      },
    );
  };

  const download = () => {
    const blob = new Blob([exportCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "core-plus-roster.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const blocked = Boolean(preview && preview.issues.length > 0);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="min-w-0">
        <SectionTitle>IMPORT MEMBERS</SectionTitle>
        <p className="text-ink-3 mt-2 text-[12px] font-semibold">
          Paste CSV below. Nothing is written until you review the preview and
          confirm — a half-applied import is worse than a refused one.
        </p>

        <textarea
          className={`${inputClass} mt-4 min-h-[200px] font-mono text-[12.5px]`}
          value={text}
          disabled={pending}
          placeholder={SAMPLE}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
            setError(null);
            setSuccess(null);
          }}
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={pending || !text.trim()} onClick={runPreview}>
            Preview
          </Button>
          {preview && !blocked && (
            <Button variant="primary" disabled={pending} onClick={apply}>
              Import {preview.rows.length} row
              {preview.rows.length === 1 ? "" : "s"}
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => setText(SAMPLE)}
          >
            Use sample
          </Button>
        </div>

        {error && (
          <div className="mt-4">
            <Banner tone="error">{error}</Banner>
          </div>
        )}
        {success && (
          <div className="mt-4">
            <Banner tone="success">{success}</Banner>
          </div>
        )}

        {preview && (
          <div className="mt-5">
            {blocked ? (
              <Banner tone="error">
                {preview.issues.length} problem
                {preview.issues.length === 1 ? "" : "s"} found. Fix them and
                preview again — nothing has been imported.
              </Banner>
            ) : (
              <Banner tone="success">
                {preview.rows.length} row
                {preview.rows.length === 1 ? "" : "s"} ready to import.
              </Banner>
            )}

            {preview.issues.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {preview.issues.map((issue, i) => (
                  <li
                    key={`${issue.line}-${i}`}
                    className="text-negative text-[12.5px] font-semibold"
                  >
                    Line {issue.line}: {issue.message}
                  </li>
                ))}
              </ul>
            )}

            {preview.rows.length > 0 && (
              <div className="mt-4 -mx-5 overflow-x-auto sm:-mx-6">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="border-line bg-surface-2 text-ink-3 border-y text-[10px] font-extrabold tracking-[0.14em] uppercase">
                      <th className="px-5 py-2.5 text-left sm:px-6">Line</th>
                      <th className="px-2 py-2.5 text-left">Name</th>
                      <th className="px-2 py-2.5 text-left">Email</th>
                      <th className="px-2 py-2.5 text-left">Team</th>
                      <th className="px-5 py-2.5 text-left sm:px-6">Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => {
                      const unknownTeam = !teamNames.some(
                        (t) => t.toLowerCase() === row.team.toLowerCase(),
                      );
                      return (
                        <tr
                          key={row.line}
                          className="border-line-2 border-b last:border-0"
                        >
                          <td className="text-ink-3 px-5 py-2.5 text-[12px] font-bold sm:px-6">
                            {row.line}
                          </td>
                          <td className="text-ink px-2 py-2.5 text-[13px] font-bold">
                            {row.name}
                          </td>
                          <td className="text-ink-2 px-2 py-2.5 text-[12.5px] font-semibold">
                            {row.email}
                          </td>
                          <td
                            className={`px-2 py-2.5 text-[12.5px] font-semibold ${unknownTeam ? "text-negative" : "text-ink-2"}`}
                          >
                            {row.team}
                            {unknownTeam && " ✕"}
                          </td>
                          <td className="text-ink-2 px-5 py-2.5 text-[12.5px] font-semibold sm:px-6">
                            {row.role}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <Eyebrow>Expected columns</Eyebrow>
          <ul className="mt-3 flex flex-col gap-2">
            {[
              ["name", "Required"],
              ["email", "Required · matched to update"],
              ["team", "Required · must already exist"],
              ["position", "Optional · PG, SG, SF, PF, C"],
              ["role", "Optional · member or coach"],
            ].map(([col, note]) => (
              <li key={col} className="flex items-baseline justify-between gap-3">
                <code className="text-ink text-[12.5px] font-bold">{col}</code>
                <span className="text-ink-3 text-right text-[11.5px] font-semibold">
                  {note}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <Eyebrow>Teams in this season</Eyebrow>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {teamNames.map((name) => (
              <span
                key={name}
                className="border-line bg-surface-2 text-ink-2 rounded-full border px-2.5 py-1 text-[11.5px] font-bold"
              >
                {name}
              </span>
            ))}
          </div>
        </Card>

        <Card>
          <Eyebrow>Export</Eyebrow>
          <DisplayNumber className="text-ink mt-1 text-[28px]">
            {Math.max(0, exportCsv.split("\r\n").length - 1)}
          </DisplayNumber>
          <p className="text-ink-3 mt-1 text-[12px] font-semibold">
            members with current scores
          </p>
          <Button variant="ghost" className="mt-3" onClick={download}>
            Download CSV
          </Button>
        </Card>
      </div>
    </div>
  );
}
