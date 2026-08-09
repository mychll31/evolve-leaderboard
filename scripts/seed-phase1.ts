import "dotenv/config";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { seasons } from "../src/db/schema";
import {
  PHASE1_CHECKLIST,
  PHASE1_ITEMS,
  planPhase1Metrics,
  seedPhase1Metrics,
} from "../src/db/seed-phase1";

/**
 * Pushes the E-VOLVE Phase 1 student checklist into a season as metrics.
 *
 * Written for production: it prints what it is about to do, defaults to the
 * active season, and is safe to run twice — items are matched by key, so a
 * second run corrects wording and order instead of duplicating the checklist.
 *
 *   npm run db:seed:phase1 -- --dry-run
 *   npm run db:seed:phase1
 *   npm run db:seed:phase1 -- --season <id> --archive-others
 */

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Seeds the Phase 1 checklist (${PHASE1_ITEMS.length} metrics).

  --dry-run          Show what would change; write nothing.
  --season <id>      Target season. Defaults to the active season.
  --archive-others   Archive metrics that are not on the checklist, so the
                     board shows Phase 1 only. Their history is kept.
`);
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const archiveOthers = args.includes("--archive-others");
const seasonFlag = args.indexOf("--season");
const requestedSeason =
  seasonFlag >= 0 ? args[seasonFlag + 1]?.trim() : undefined;

if (seasonFlag >= 0 && !requestedSeason) {
  console.error("--season needs a season id.");
  process.exit(1);
}

const db = getDb();

const [season] = requestedSeason
  ? await db.select().from(seasons).where(eq(seasons.id, requestedSeason)).limit(1)
  : await db
      .select()
      .from(seasons)
      .where(eq(seasons.status, "active"))
      .orderBy(desc(seasons.startsOn))
      .limit(1);

if (!season) {
  console.error(
    requestedSeason
      ? `No season with id ${requestedSeason}.`
      : "No active season. Create one at /admin/seasons, or pass --season <id>.",
  );
  process.exit(1);
}

console.log(`Season: ${season.name} (${season.id}) · ${season.status}`);
console.log(
  `Checklist: ${PHASE1_ITEMS.length} items across ${PHASE1_CHECKLIST.length} sections\n`,
);

const plan = await planPhase1Metrics(db, season.id);

const list = (label: string, items: { key: string; name: string }[]) => {
  if (items.length === 0) return;
  console.log(`${label} (${items.length})`);
  for (const item of items) console.log(`  ${item.key.padEnd(20)} ${item.name}`);
  console.log("");
};

list("CREATE", plan.created);
list("UPDATE", plan.updated);
console.log(`UNCHANGED (${plan.unchanged.length})\n`);

if (plan.others.length > 0) {
  console.log(
    archiveOthers
      ? `ARCHIVE — not on the checklist (${plan.others.length})`
      : `LEFT ALONE — not on the checklist (${plan.others.length}); pass --archive-others to archive them`,
  );
  for (const other of plan.others) {
    console.log(
      `  ${other.key.padEnd(20)} ${other.name}${other.active ? "" : " (already archived)"}`,
    );
  }
  console.log("");
}

if (dryRun) {
  console.log("Dry run — nothing was written.");
  process.exit(0);
}

await seedPhase1Metrics(db, season.id, { archiveOthers });

console.log(
  `Done. ${plan.created.length} created, ${plan.updated.length} updated.`,
);
console.log(
  "Every active metric counts equally, so a student who has ticked half of them sits at 50%.",
);
