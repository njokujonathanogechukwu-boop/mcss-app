import "server-only";
import { generateText } from "ai";

// The gateway is the AI SDK's default provider, so a plain "provider/model"
// string routes through it. Switch models with the ANNOUNCEMENT_MODEL env var
// without touching code.
const MODEL = process.env.ANNOUNCEMENT_MODEL ?? "openai/gpt-4.1-mini";

/**
 * Whether a draft can be generated. On Vercel the gateway authenticates by
 * OIDC with no key; elsewhere it needs AI_GATEWAY_API_KEY. When this is false
 * the compose button is hidden and the secretary writes the announcement
 * by hand.
 */
export function aiConfigured(): boolean {
  return Boolean(process.env.VERCEL) || Boolean(process.env.AI_GATEWAY_API_KEY);
}

export type ComposeInput = {
  title?: string;
  eventDate?: string;
  details: string;
};

export type ComposeResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

const INSTRUCTIONS = [
  "You write short announcements to be read aloud at a Jehovah's Witness",
  "congregation meeting. Keep it warm, clear and brief — two to four sentences",
  "in plain English that someone can read out smoothly. Use only the facts you",
  "are given: never invent dates, times, names, places, prices or scriptures.",
  "If a detail is missing, leave it out rather than guessing. Do not add a",
  "greeting or a signature; output only the announcement text.",
].join(" ");

function buildPrompt(input: ComposeInput): string {
  const lines: string[] = [];
  if (input.title?.trim()) lines.push(`Subject: ${input.title.trim()}`);
  if (input.eventDate?.trim()) lines.push(`Date: ${input.eventDate.trim()}`);
  lines.push(`Key details: ${input.details.trim()}`);
  lines.push("", "Write the announcement to be read to the congregation.");
  return lines.join("\n");
}

/**
 * Draft announcement text from the details the secretary typed. Only those
 * details are sent to the model — never publisher records or any other
 * congregation data. Never throws: a failure comes back as { ok: false }.
 */
export async function composeAnnouncement(input: ComposeInput): Promise<ComposeResult> {
  const details = input.details.trim();
  if (!details) return { ok: false, error: "Add the key details first, then draft it." };

  try {
    const { text } = await generateText({
      model: MODEL,
      instructions: INSTRUCTIONS,
      prompt: buildPrompt(input),
      temperature: 0.6,
      maxOutputTokens: 400,
    });
    const clean = text.trim();
    if (!clean) return { ok: false, error: "The model returned nothing. Please try again." };
    return { ok: true, text: clean };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The AI request failed.";
    return { ok: false, error: `Could not draft it: ${message}` };
  }
}
