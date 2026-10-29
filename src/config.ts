/**
 * Public frontend configuration (Vite env vars, baked into the static build).
 * None of these values are secrets: the Apps Script URL and the Google OAuth
 * client ID are both visible to every visitor of a web app anyway.
 */
export const config = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? '',
  googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '',
  /** Local development only: sign in against scripts/dev-backend.mjs without Google. */
  devAuth: import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === 'true'
};

export const isConfigured = Boolean(config.apiUrl && (config.googleClientId || config.devAuth));
