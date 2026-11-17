// Plain, readable layout for /privacy and /terms. These pages are public (see middleware)
// because Google's OAuth consent screen links to them.

// Fill in before publishing: where users write for questions and deletion requests.
export const CONTACT_EMAIL = "";

export const UPDATED = "November 16, 2026";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", background: "#242124", color: "#feffdc", padding: "48px 16px", font: "300 16px/1.6 Mulish, system-ui, sans-serif" }}>
      <article style={{ maxWidth: 720, margin: "0 auto" }}>
        <a href="/login" style={{ color: "#e63f6b", textDecoration: "none", font: "500 20px 'Chakra Petch', sans-serif" }}>Pinbox</a>
        <h1 style={{ font: "500 36px/1.2 'Chakra Petch', sans-serif", margin: "24px 0 4px" }}>{title}</h1>
        <p style={{ color: "#78736a", marginTop: 0 }}>Last updated {UPDATED}</p>
        {children}
      </article>
    </main>
  );
}

export function Contact() {
  return CONTACT_EMAIL
    ? <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#e63f6b" }}>{CONTACT_EMAIL}</a>
    : <>the Pinbox developer</>;
}
