/**
 * NapCat status provider for the aggregated `/qqbot/status` snapshot.
 */

/** @param {object} napcat NapcatManager */
export function createStatusProvider(napcat) {
  return async function napcatStatus() {
    const status = await napcat.status().catch((error) => ({
      error: String(error?.message ?? error),
      running: false,
      loggedIn: false,
      installed: false,
      accounts: [],
    }))
    return { napcat: status }
  }
}
