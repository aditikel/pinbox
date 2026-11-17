import { LegalPage, Contact } from "@/components/LegalPage";

export const metadata = { title: "Terms of service · Pinbox" };

export default function Terms() {
  return (
    <LegalPage title="Terms of service">
      <p>By using Pinbox you agree to these terms.</p>

      <h2>The service</h2>
      <p>Pinbox organizes your recruiting emails, calendar events, and resumes into a dashboard. It is an early-stage project offered free of charge and may change, be unavailable at times, or be discontinued.</p>

      <h2>Your account</h2>
      <p>You are responsible for your account and for the content you upload, such as resumes and CSV files. Only connect Google accounts that belong to you.</p>

      <h2>Accuracy</h2>
      <p>Pinbox uses automated rules and AI to read your emails, so statuses, dates, and deadlines can be wrong or missing. Always check important deadlines against the original email. Pinbox is not responsible for missed deadlines or opportunities.</p>

      <h2>Acceptable use</h2>
      <p>Do not misuse Pinbox: no attempts to access other users&apos; data, overload the service, or use it for anything unlawful.</p>

      <h2>Your data</h2>
      <p>Your data stays yours. How Pinbox handles it is described in the <a href="/privacy" style={{ color: "#e63f6b" }}>privacy policy</a>. You can stop using Pinbox and ask for your data to be deleted at any time.</p>

      <h2>No warranty</h2>
      <p>Pinbox is provided &quot;as is&quot;, without warranties of any kind. To the extent the law allows, Pinbox and its developer are not liable for any indirect or consequential damages from using it.</p>

      <h2>Changes</h2>
      <p>These terms may be updated; the date at the top will change when they do.</p>

      <h2>Contact</h2>
      <p>Questions: <Contact />.</p>
    </LegalPage>
  );
}
