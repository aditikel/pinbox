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
  event_at: z.string().nullable(), // ISO date-time of a scheduled interview / coffee chat, if the email states one
  confidence: z.number(),
});
export type Result = z.infer<typeof ResultSchema>;
const FORMAT = zodOutputFormat(ResultSchema); // JSON schema sent to the API + a validating parser

const SYSTEM = `You label one recruiting email for a student's job-search dashboard.
Categories:
- applied: confirmation that the student's application was received
- oa: an online assessment or coding test to complete
- interview_invite: invitation to interview, or a confirmed interview time
- scheduling: asks the student to reply with availability or book a slot
- offer: a job offer
- rejection: the application is closed
- coffee_chat: a one-on-one conversation the student is actually having with a specific person at a company (a coffee chat, call, or back-and-forth networking email)
- not_recruiting: newsletters, job alerts, marketing, or anything not about the student's own applications
Mass outreach is not_recruiting, not coffee_chat: Handshake, LinkedIn or job-board messages, recruiter blasts, "we'd love to connect" templates, career fair and info session invitations, unless the student has replied and a real conversation is underway. The user message says whether the student has replied in the thread.
Many emails come from ATS no-reply senders (Greenhouse, Workday, Lever, Handshake), so read the company and role from the text, not the sender.
company: the hiring company's common name, the same way every time ("Stripe", not "Stripe, Inc."; "FTI Consulting" and "FTI" are one company: use "FTI Consulting").
role: the job title only ("Software Engineering Intern"). Never an interview stage, round, or event ("Final Round Interview", "Superday", "Phone Screen" are not roles). Leave role empty if the email doesn't name a job title.
deadline is only an assessment due date or an offer response deadline, as YYYY-MM-DD; otherwise null.
event_at: for interview_invite or coffee_chat with a confirmed date and time, that start time as ISO 8601 with the timezone offset if known (2026-11-20T14:00:00-05:00); otherwise null.
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
      messages: [{ role: "user", content: `From: ${m.from}\nSubject: ${m.subject}\nDate: ${m.date}\nMessages in thread: ${m.count}\nStudent has replied in this thread: ${m.replied ? "yes" : "no"}\n\n${m.text}` }],
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

const notRecruiting = (): Result => ({ category: "not_recruiting", company: "", role: "", deadline: null, event_at: null, confidence: 0 });
