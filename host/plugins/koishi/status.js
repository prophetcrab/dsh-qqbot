/**
 * Koishi/bot status provider for the aggregated `/qqbot/status` snapshot.
 */

/** @param {object} koishi KoishiManager */
export function createStatusProvider(koishi) {
  return async function koishiStatus() {
    const status = await koishi.status().catch((error) => ({
      error: String(error?.message ?? error),
      running: false,
      online: false,
      logs: [],
    }))
    return {
      koishi: status,
      bot: {
        online: status?.online === true,
        selfId: status?.selfId ?? null,
        platform: status?.platform ?? null,
        uptime: status?.stats?.startedAt ?? null,
      },
    }
  }
}
