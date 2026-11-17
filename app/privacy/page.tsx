import { LegalPage, Contact } from "@/components/LegalPage";

export const metadata = { title: "Privacy policy · Pinbox" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>Pinbox is a dashboard for students who are recruiting. It reads recruiting emails and calendar events from your Google account and turns them into one list of applications and the actions each one needs. This policy explains what Pinbox reads, what it keeps, and what you can do about it.</p>

      <h2>What Pinbox reads</h2>
      <ul>
        <li><b>Your account details:</b> your name and email address, from Google sign-in or the email you sign up with.</li>
        <li><b>Gmail (read-only), only if you connect it:</b> emails that match a recruiting filter (for example applications, interview invitations, recruiter messages) from a start date you choose. Emails outside the filter are never opened in full.</li>
        <li><b>Google Calendar (read-only), only if you connect it:</b> events that match the same recruiting filter. Pinbox uses the title, time, organizer and attendee domains.</li>
        <li><b>Files you add:</b> resumes you upload and CSV files you import.</li>
      </ul>

      <h2>What Pinbox stores</h2>
      <ul>
        <li>Fields extracted from matching emails and events: company, role, status, dates, deadlines, next actions, and contacts.</li>
        <li>The Gmail thread ID or calendar event ID, so Pinbox can link back to the source and avoid duplicates.</li>
        <li>The resumes you upload, in private storage that only your account can access.</li>
        <li>A Google refresh token, encrypted, so Pinbox can sync in the background. It is never shown to anyone or written to logs.</li>
      </ul>
      <p><b>Pinbox never stores</b> email bodies, calendar event descriptions, events outside the recruiting filter, compensation or offer terms, or interviewer feedback. For offers, only the response deadline is kept.</p>

      <h2>How Pinbox uses AI</h2>
      <p>To read each matching email, Pinbox sends a trimmed copy (quoted replies removed) or the event details listed above to Anthropic&apos;s Claude API, which returns the structured fields. This goes through an API that does not use the content to train models. Pinbox never logs what it sends to the model, and the email text is discarded after the fields are extracted.</p>

      <h2>Google user data</h2>
      <p>Pinbox&apos;s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" style={{ color: "#e63f6b" }}>Google API Services User Data Policy</a>, including the Limited Use requirements. Specifically:</p>
      <ul>
        <li>Google data is used only to show you your own recruiting pipeline inside Pinbox.</li>
        <li>It is not sold, not used for advertising, and not shared with anyone except the service providers needed to run Pinbox (Supabase for the database and storage, Vercel for hosting, Anthropic for extraction).</li>
        <li>No person reads your Google data, unless you ask for help with a specific problem and agree to it, it is needed for security or abuse investigations, or the law requires it.</li>
        <li>Google data is not used to train general-purpose AI models.</li>
      </ul>

      <h2>Who can see your data</h2>
      <p>Only you. Every table is protected by row-level security so each account can read only its own rows. Pinbox does not sell or share your data.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Edit or delete any application, event, or contact in the app. Deleted email-derived items are never re-imported.</li>
        <li>Remove Pinbox&apos;s access to Gmail and Calendar at any time from your Google account at <a href="https://myaccount.google.com/permissions" style={{ color: "#e63f6b" }}>myaccount.google.com/permissions</a>.</li>
        <li>To delete your account and everything Pinbox stores about you (records, resumes, and Google tokens), contact <Contact />. Data is deleted within 30 days.</li>
      </ul>

      <h2>Changes</h2>
      <p>If this policy changes, the date at the top will change. Significant changes will be shown in the app.</p>

      <h2>Contact</h2>
      <p>Questions about privacy: <Contact />.</p>
    </LegalPage>
  );
}
