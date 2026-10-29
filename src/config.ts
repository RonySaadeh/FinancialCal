/**
 * Public frontend configuration (Vite env vars, baked into the static build).
 * The Apps Script URL is not a secret: every visitor's browser calls it.
 */
export const config = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? ''
};

export const isConfigured = Boolean(config.apiUrl);
