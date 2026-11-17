// Sign in with Google on /login: name and email only (non-sensitive scopes, so no
// "unverified app" screen). No offline access, so Google returns no refresh token and
// /auth/callback never overwrites a saved Gmail token with one that can't read Gmail.
export const googleLoginOptions = (origin: string) => ({
  redirectTo: `${origin}/auth/callback`,
  queryParams: { prompt: "select_account" },
});

// Connect Gmail on /start: asks for Gmail and Calendar read access.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export const googleOptions = (origin: string) => ({
  redirectTo: `${origin}/auth/callback`,
  scopes: GOOGLE_SCOPES,
  // offline + consent make Google return a refresh token for background sync;
  // select_account always shows the account picker so users can switch Gmail accounts
  queryParams: { access_type: "offline", prompt: "select_account consent" },
});
