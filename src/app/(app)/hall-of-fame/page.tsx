import { redirect } from "next/navigation";

export default function HallOfFameRedirectPage() {
  redirect("/leaderboard");
}
