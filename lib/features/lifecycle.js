/**
 * Lifecycle feature: start/stop NapCat and Koishi, plus one-click both.
 *
 * Every action returns `{ ok, message, steps? }` so the panel and the agent
 * tool can show partial results instead of a bare failure.
 */

/** @param {import('../features.js').FeatureDeps} deps */
async function status(deps) {
  const [napcat, koishi] = await Promise.all([
    deps.napcat.status().catch((error) => ({ running: false, error: String(error?.message ?? error) })),
    deps.koishi.status().catch((error) => ({ running: false, error: String(error?.message ?? error) })),
  ])
  return {
    napcat: { running: napcat?.running === true, loggedIn: napcat?.loggedIn === true, pid: napcat?.pid ?? null },
    koishi: { running: koishi?.running === true, online: koishi?.online === true, pid: koishi?.pid ?? null },
  }
}

/** Run one step and normalize its result. */
async function step(name, fn) {
  try {
    const result = await fn()
    return { name, ok: result?.ok !== false, message: result?.message, data: result?.data }
  } catch (error) {
    return { name, ok: false, message: String(error?.message ?? error) }
  }
}

/** @param {import('../features.js').FeatureDeps} deps */
async function startAll(deps) {
  const steps = []
  steps.push(await step('napcat', () => deps.napcat.start()))
  steps.push(await step('koishi', () => deps.koishi.start()))
  return {
    ok: steps.some((entry) => entry.ok),
    message: steps.map((entry) => `${entry.name}: ${entry.ok ? 'ok' : 'failed'}${entry.message ? ` (${entry.message})` : ''}`).join('; '),
    steps,
  }
}

/** @param {import('../features.js').FeatureDeps} deps */
async function stopAll(deps) {
  const steps = []
  steps.push(await step('koishi', () => deps.koishi.stop()))
  steps.push(await step('napcat', () => deps.napcat.stop()))
  return {
    ok: steps.every((entry) => entry.ok),
    message: steps.map((entry) => `${entry.name}: ${entry.ok ? 'stopped' : 'failed'}${entry.message ? ` (${entry.message})` : ''}`).join('; '),
    steps,
  }
}

export default {
  id: 'lifecycle',
  title: { zh: '启停', en: 'Lifecycle' },
  description: {
    zh: '启动或停止 NapCat（QQ）与 Koishi，支持一键全启/全停。',
    en: 'Start or stop NapCat (QQ) and Koishi, including one-click start/stop for both.',
  },
  status,
  actions: [
    {
      id: 'all-start',
      title: { zh: '一键启动全部', en: 'Start everything' },
      tone: 'primary',
      run: (deps) => startAll(deps),
    },
    {
      id: 'all-stop',
      title: { zh: '全部停止', en: 'Stop everything' },
      tone: 'danger',
      run: (deps) => stopAll(deps),
    },
    {
      id: 'napcat-start',
      title: { zh: '启动 NapCat', en: 'Start NapCat' },
      run: async (deps) => deps.napcat.start(),
    },
    {
      id: 'napcat-stop',
      title: { zh: '停止 NapCat', en: 'Stop NapCat' },
      tone: 'danger',
      run: async (deps) => deps.napcat.stop(),
    },
    {
      id: 'koishi-start',
      title: { zh: '启动 Koishi', en: 'Start Koishi' },
      run: async (deps) => deps.koishi.start(),
    },
    {
      id: 'koishi-stop',
      title: { zh: '停止 Koishi', en: 'Stop Koishi' },
      tone: 'danger',
      run: async (deps) => deps.koishi.stop(),
    },
    {
      id: 'koishi-restart',
      title: { zh: '重启 Koishi', en: 'Restart Koishi' },
      run: async (deps) => deps.koishi.restart(),
    },
  ],
}
