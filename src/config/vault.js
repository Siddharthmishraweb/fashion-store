/**
 * App vault — feature flags baked in at build time.
 *
 * GitHub Actions (the deploy vault) overrides these with repository
 * Secrets/Variables of the same name. Local `.env` also wins when set.
 *
 * USE_MOCK
 *   true  → in-browser mock catalogue (no API process required)
 *   false → real Fastify API at VITE_API_URL
 */
export const vault = {
  USE_MOCK: true,
}
