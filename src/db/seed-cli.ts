import "dotenv/config";
import { getDb } from "./client";
import { seed } from "./seed";

const result = await seed(getDb());

console.log("Seeded Core+ Season 1");
console.log(`  season       ${result.seasonId}`);
console.log(`  teams        ${result.teamIds.length}`);
console.log(`  members      ${result.membershipIds.length}`);
console.log(`  held meetings ${result.heldMeetings}`);
