type AffirmationInput = {
  name: string;
  teamName: string;
  score: number;
  loggedCount: number;
  totalMetrics: number;
  now?: Date;
};

const TIME_ZONE = "Asia/Manila";

const TEMPLATES = [
  "{firstName}, one honest log today is progress. Keep {teamName} moving.",
  "Small wins add up, {firstName}. Pick one item, finish it, then log it.",
  "{teamName} gets stronger through steady work. Your next logged item matters.",
  "Stay focused, {firstName}. A clear next step beats waiting for a perfect day.",
  "Your score grows one completed item at a time. Keep it simple and keep going.",
  "{firstName}, protect the habit: do the work, mark it done, move forward.",
  "Every completed item gives {teamName} a clearer picture of your progress.",
  "Today is a good day for one clean check-in, {firstName}.",
];

function dateKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i++) {
    value = (value * 31 + text.charCodeAt(i)) >>> 0;
  }
  return value;
}

export function dailyAffirmation({
  name,
  teamName,
  score,
  loggedCount,
  totalMetrics,
  now = new Date(),
}: AffirmationInput): string {
  const firstName = name.trim().split(/\s+/)[0] || "You";
  const template = TEMPLATES[
    hash(`${dateKey(now)}:${name}:${teamName}:${loggedCount}:${totalMetrics}`)
      % TEMPLATES.length
  ];

  if (score >= 100) {
    return `Clean finish, ${firstName}. You completed every tracked item for ${teamName}.`;
  }

  return template
    .replaceAll("{firstName}", firstName)
    .replaceAll("{teamName}", teamName);
}
