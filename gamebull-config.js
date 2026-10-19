// Set these deployment-owned values after GameBull confirms its launch contract.
// Never put an API secret or boot token in this file. API URLs cannot come from query parameters.
window.GAMEBULL_CONFIG = Object.freeze({
  apiBase: 'https://api.staging.g-b.store', // Confirmed API base, including any prefix; HTTPS required in production.
  gameCode: 'RICE_FIELD_PUZZLE',
  bootTokenParam: 'bootToken', // Provisional: confirm with the GameBull developer.
  tenantSlugParam: 'tenantSlug',
  livesPath: 'lives.count', // Confirm the existing /context balance field; e.g. lives.remaining.
  requestTimeoutMs: 15000
});
