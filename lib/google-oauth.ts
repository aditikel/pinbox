// Google OAuth options shared by /login (sign in with Google) and /start (connect Gmail to an email account).
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
