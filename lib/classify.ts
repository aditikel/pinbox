import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Slim } from "./gmail";

export const CATEGORIES = ["applied", "oa", "interview_invite", "scheduling", "offer", "rejection", "coffee_chat", "not_recruiting"] as const;

const ResultSchema = z.object({
  category: z.enum(CATEGORIES),
  company: z.string(),
  role: z.string(),
  deadline: z.string().nullable(), // YYYY-MM-DD, OA due date or offer response date only
  confidence: z.number(),
});
export type Result = z.infer<typeof ResultSchema>;
const FORMAT = zodOutputFormat(ResultSchema); // JSON schema sent to the API + a validating parser

const SYSTEM = `You label one recruiting email for a student's job-search dashboard.
Categories:
- applied: confirmation that an application was received
- oa: an online assessment or coding test to complete
- interview_invite: invitation to interview, or a confirmed interview time
- scheduling: asks the student to reply with availability or book a slot
- offer: a job offer
- rejection: the application is closed
- coffee_chat: informal networking, coffee chat or recruiter call with someone at a company
- not_recruiting: newsletters, job alerts, marketing, or anything not about the student's own applications
Many emails come from ATS no-reply senders (Greenhouse, Workday, Lever), so read the company and role from the text, not the sender. Use the hiring company's plain name ("Stripe", not "Stripe, Inc."). Leave role empty if the email doesn't name one.
deadline is only an assessment due date or an offer response deadline, as YYYY-MM-DD; otherwise null.
Never extract pay, offer terms, or interviewer feedback.
confidence is 0 to 1: how sure you are of the category and company together.`;

let client: Anthropic | null = null;
const api = () => (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 4 }));

// Thrown when the API key or account is the problem, so backfill can stop instead of failing every thread.
export class ClassifierConfigError extends Error {}

export async function classify(m: Slim): Promise<Result> {
  try {
    const res = await api().messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: 2000,
      output_config: { effort: "low", format: FORMAT },
      system: SYSTEM,
      messages: [{ role: "user", content: `From: ${m.from}\nSubject: ${m.subject}\nDate: ${m.date}\n\n${m.text}` }],
    });
    // Check the stop reason before parsing: a refusal has no JSON to parse.
    if (res.stop_reason === "refusal") return notRecruiting();
    const text = res.content.find((b) => b.type === "text")?.text ?? "";
    try { return FORMAT.parse(text); } catch { return notRecruiting(); }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError || e instanceof Anthropic.NotFoundError) {
      throw new ClassifierConfigError("The Anthropic API key or model isn't valid. Check ANTHROPIC_API_KEY and ANTHROPIC_MODEL in .env.local.");
    }
    // Status only. Never log the email text.
    throw new Error(e instanceof Anthropic.APIError ? `Classifier ${e.status}` : "Classifier failed");
  }
}

const notRecruiting = (): Result => ({ category: "not_recruiting", company: "", role: "", deadline: null, confidence: 0 });
