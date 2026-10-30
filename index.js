/**
 * dsh-qqbot — QQ bot control center for DeepSeek Harness.
 *
 * Host half: detects the local QQ/NapCat/Koishi setup, exposes RPC routes for
 * the web panel (install/configure/start/stop, Koishi plugin management), a
 * feature registry other plugins can extend, and agent tools for the same
 * operations.
 *
 * @module dsh-qqbot
 */

import { accessPath, normalizePolicy, readPolicy, summarizePolicy, writePolicy } from './lib/access.js'
import { FeatureRegistry, loadBuiltinFeatures } from './lib/features.js'
import { KoishiManager } from './lib/koishi.js'
import { KoishiPluginsManager } from './lib/koishi-plugins.js'
import { NapcatManager } from './lib/napcat.js'
import {
  detectKoishiProject,
  detectNapcat,
  detectQq,
  macInfo,
  resolveSettings,
} from './lib/platform.js'

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'qqbot'

/** Required services. */
export const inject = ['webServer', 'tools', 'systemPrompt']

const MAX_BODY_BYTES = 256 * 1024

/** @param {string} message */
const errorText = (message) => String(message ?? 'unknown error')

/**
 * Register the plugin.
 *
 * @param {import('cordis').Context} ctx
 * @param {Record<string, unknown>} [config]
 */
export async function apply(ctx, config) {
  const settings = resolveSettings(config ?? {})
  const logger = ctx.logger('qqbot')

  const napcat = new NapcatManager({ settings, logger: ctx.logger('qqbot/napcat') })
  const koishi = new KoishiManager({ settings, logger: ctx.logger('qqbot/koishi') })
  const plugins = new KoishiPluginsManager({ koishi, settings, logger: ctx.logger('qqbot/plugins') })

  const registry = new FeatureRegistry({
    settings,
    logger,
    napcat,
    koishi,
    plugins,
    platform: { detectQq, detectNapcat, detectKoishiProject, macInfo },
  })
  await loadBuiltinFeatures(registry)

  // Serialize mutations so two clicks cannot start the same process twice.
  let queue = Promise.resolve()
  /** @param {() => Promise<any>} task */
  const serialize = (task) => {
    const run = queue.then(task, task)
    queue = run.then(() => undefined, () => undefined)
    return run
  }

  /** Aggregate everything the panel needs in one round trip. */
  const statusSnapshot = async () => {
    const [napcatStatus, koishiStatus] = await Promise.all([
      napcat.status().catch((error) => ({ error: errorText(error?.message ?? error), running: false, loggedIn: false, installed: false, accounts: [] })),
      koishi.status().catch((error) => ({ error: errorText(error?.message ?? error), running: false, online: false, logs: [] })),
    ])
    const featureStatus = await registry.statusAll()
    const qq = safeDetect(() => detectQq(), { installed: false, path: null, version: null })
    const platform = safeDetect(() => macInfo(), { isMac: process.platform === 'darwin', arch: process.arch, release: '', osVersion: null })
    const bot = {
      online: koishiStatus?.online === true,
      selfId: koishiStatus?.selfId ?? null,
      platform: koishiStatus?.platform ?? null,
      uptime: koishiStatus?.stats?.startedAt ?? null,
    }
    return {
      platform: { ...platform, node: process.version },
      settings: {
        projectDir: settings.projectDir,
        koishiPort: settings.koishiPort,
        napcatPort: settings.napcatPort,
        reversePath: settings.reversePath,
      },
      qq,
      napcat: napcatStatus,
      koishi: koishiStatus,
      bot,
      features: registry.list().map((feature) => ({
        ...feature,
        status: featureStatus[feature.id]?.status ?? null,
        error: featureStatus[feature.id]?.error ?? null,
      })),
      updatedAt: new Date().toISOString(),
    }
  }

  // Expose the extension seam to other DSH plugins.
  ctx.provide('qqbot')
  ctx.set('qqbot', {
    settings,
    status: { napcat, koishi, plugins },
    features: registry,
    registerFeature: (feature) => registry.register(feature),
    getStatus: statusSnapshot,
  })

  // ---------------------------------------------------------------- routes --
  ctx.inject(['webServer'], (child) => {
    const route = (path, handler) => child.effect(() => child.webServer.register({
      kind: 'exact',
      path,
      handler,
    }), `dsh-qqbot: ${path}`)

    route('/qqbot/status', (req, res) => only(req, res, ['GET'], async () => {
      sendJson(res, 200, { ok: true, data: await statusSnapshot() })
    }))

    route('/qqbot/features', (req, res) => only(req, res, ['GET'], async () => {
      const featureStatus = await registry.statusAll()
      sendJson(res, 200, {
        ok: true,
        data: registry.list().map((feature) => ({
          ...feature,
          status: featureStatus[feature.id]?.status ?? null,
          error: featureStatus[feature.id]?.error ?? null,
        })),
      })
    }))

    route('/qqbot/features/run', (req, res) => only(req, res, ['POST'], async () => {
      const body = await readBody(req)
      const featureId = stringField(body, 'feature')
      const actionId = stringField(body, 'action')
      if (featureId === '' || actionId === '') {
        sendJson(res, 400, { ok: false, error: 'feature and action are required' })
        return
      }
      const result = await registry.run(featureId, actionId, body.params ?? {})
      sendJson(res, 200, { ok: result?.ok !== false, data: result })
    }))

    route('/qqbot/access', (req, res) => only(req, res, ['GET', 'POST'], async () => {
      const file = accessPath(settings)
      if (req.method === 'GET') {
        const { policy, exists, error } = await readPolicy(file)
        sendJson(res, 200, { ok: true, data: policy, exists, ...(error ? { warning: error } : {}) })
        return
      }
      const body = await readBody(req)
      const policy = await serialize(() => writePolicy(file, body))
      sendJson(res, 200, { ok: true, data: policy })
    }))

    route('/qqbot/logs', (req, res) => only(req, res, ['GET'], async () => {
      const source = urlParam(req, 'source') ?? 'koishi'
      const lines = clampInt(urlParam(req, 'lines'), settings.logLines, 1, 2000)
      if (source === 'napcat') {
        // NapCat's console output is not captured by this plugin; its own WebUI
        // exposes logs. Return a hint instead of inventing content.
        sendJson(res, 200, { ok: true, lines: [], note: 'NapCat 日志请打开 NapCat WebUI → 日志 查看' })
        return
      }
      sendJson(res, 200, { ok: true, lines: await koishi.logs(lines) })
    }))

    // ---- NapCat -----------------------------------------------------------
    route('/qqbot/napcat/install', (req, res) => only(req, res, ['POST'], async () => {
      sendJson(res, 200, await serialize(() => napcat.install()))
    }))
    route('/qqbot/napcat/configure', (req, res) => only(req, res, ['POST'], async () => {
      const body = await readBody(req)
      const uin = stringField(body, 'uin')
      sendJson(res, 200, await serialize(() => napcat.configure(uin === '' ? {} : { uin })))
    }))
    route('/qqbot/napcat/start', (req, res) => only(req, res, ['POST'], async () => {
      sendJson(res, 200, await serialize(() => napcat.start()))
    }))
    route('/qqbot/napcat/stop', (req, res) => only(req, res, ['POST'], async () => {
      sendJson(res, 200, await serialize(() => napcat.stop()))
    }))

    // ---- Koishi -----------------------------------------------------------
    route('/qqbot/koishi/install-deps', (req, res) => only(req, res, ['POST'], async () => {
      sendJson(res, 200, await serialize(() => koishi.installDeps()))
    }))
    route('/qqbot/koishi/start', (req, res) => only(req, res, ['POST'], async () => {
      sendJson(res, 200, await serialize(() => koishi.start()))
    }))
    route('/qqbot/koishi/stop', (req, res) => only(req, res, ['POST'], async () => {
      sendJson(res, 200, await serialize(() => koishi.stop()))
    }))
    route('/qqbot/koishi/restart', (req, res) => only(req, res, ['POST'], async () => {
      sendJson(res, 200, await serialize(() => koishi.restart()))
    }))
    route('/qqbot/all/start', (req, res) => only(req, res, ['POST'], async () => {
      sendJson(res, 200, await serialize(async () => {
        const first = await registry.run('lifecycle', 'all-start', {})
        return { ok: first?.ok !== false, steps: first?.steps ?? [], message: first?.message }
      }))
    }))
    route('/qqbot/all/stop', (req, res) => only(req, res, ['POST'], async () => {
      sendJson(res, 200, await serialize(async () => {
        const first = await registry.run('lifecycle', 'all-stop', {})
        return { ok: first?.ok !== false, steps: first?.steps ?? [], message: first?.message }
      }))
    }))

    // ---- Koishi plugins ---------------------------------------------------
    route('/qqbot/koishi/plugins', (req, res) => only(req, res, ['GET'], async () => {
      sendJson(res, 200, { ok: true, data: await plugins.list() })
    }))
    route('/qqbot/koishi/plugins/toggle', (req, res) => only(req, res, ['POST'], async () => {
      const body = await readBody(req)
      const key = stringField(body, 'key')
      if (key === '') {
        sendJson(res, 400, { ok: false, error: 'key is required' })
        return
      }
      const enabled = body.enabled !== false
      const restart = body.restart === true
      sendJson(res, 200, await serialize(() => plugins.toggle(key, enabled, { restart })))
    }))
    route('/qqbot/koishi/plugins/install', (req, res) => only(req, res, ['POST'], async () => {
      const body = await readBody(req)
      const spec = stringField(body, 'spec')
      if (spec === '') {
        sendJson(res, 400, { ok: false, error: 'spec is required' })
        return
      }
      const restart = body.restart === true
      sendJson(res, 200, await serialize(() => plugins.install(spec, { restart })))
    }))
    route('/qqbot/koishi/plugins/uninstall', (req, res) => only(req, res, ['POST'], async () => {
      const body = await readBody(req)
      const key = stringField(body, 'key')
      if (key === '') {
        sendJson(res, 400, { ok: false, error: 'key is required' })
        return
      }
      const restart = body.restart === true
      sendJson(res, 200, await serialize(() => plugins.uninstall(key, { restart })))
    }))
  })

  // ----------------------------------------------------------------- tools --
  const textOutput = (text) => ({
    schema: {},
    render: (_args, value) => [{ type: 'text', text: String(value?.text ?? '') }],
  })

  ctx.tools.register({
    name: 'qqbot_status',
    description: 'Read the QQ bot control center status: QQ/NapCat/Koishi installation, running state, bot online state, and Koishi plugin counts.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: textOutput(),
    execute: async () => {
      const snapshot = await statusSnapshot()
      return { text: renderStatus(snapshot) }
    },
  })

  ctx.tools.register({
    name: 'qqbot_control',
    description: 'Start, stop or restart the local QQ bot stack (NapCat and/or Koishi). Use qqbot_status first to see the current state.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['all', 'napcat', 'koishi'], description: 'Which part to control.' },
        action: { type: 'string', enum: ['start', 'stop', 'restart'], description: 'Operation to perform.' },
      },
      required: ['target', 'action'],
      additionalProperties: false,
    },
    output: textOutput(),
    execute: async (args) => {
      const target = String(args?.target ?? 'all')
      const action = String(args?.action ?? 'start')
      if (!['all', 'napcat', 'koishi'].includes(target)) throw new Error('target must be all|napcat|koishi')
      if (!['start', 'stop', 'restart'].includes(action)) throw new Error('action must be start|stop|restart')
      const result = await serialize(async () => {
        if (target === 'all') {
          const feature = action === 'stop' ? 'all-stop' : 'all-start'
          const outcome = await registry.run('lifecycle', feature, {})
          return { ok: outcome?.ok !== false, message: outcome?.message ?? '', steps: outcome?.steps ?? [] }
        }
        if (action === 'restart') {
          if (target !== 'koishi') throw new Error('restart is only supported for target=koishi')
          return koishi.restart()
        }
        const run = action === 'start'
          ? (target === 'napcat' ? () => napcat.start() : () => koishi.start())
          : (target === 'napcat' ? () => napcat.stop() : () => koishi.stop())
        return run()
      })
      return { text: `${result?.ok === false ? '失败' : '完成'}${result?.message ? `：${result.message}` : ''}` }
    },
  })

  ctx.tools.register({
    name: 'qqbot_configure',
    description: 'Write the OneBot reverse WebSocket client into every NapCat account config and hot-apply it through the NapCat WebUI API. Run this after installing NapCat and logging in.',
    parameters: {
      type: 'object',
      properties: {
        uin: { type: 'string', description: 'Only configure this QQ account number; omit for every detected account.' },
      },
      additionalProperties: false,
    },
    output: textOutput(),
    execute: async (args) => {
      const uin = typeof args?.uin === 'string' && args.uin.trim() !== '' ? args.uin.trim() : ''
      const result = await serialize(() => napcat.configure(uin === '' ? {} : { uin }))
      return { text: result?.message ?? (result?.ok ? '配置已写入' : '配置失败') }
    },
  })

  ctx.tools.register({
    name: 'qqbot_plugin',
    description: 'Manage Koishi plugins in the local Koishi project: list them, install from npm, uninstall, or enable/disable one. Changes are written to koishi.yml; pass restart=true to restart Koishi afterwards.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'install', 'uninstall', 'enable', 'disable'], description: 'Plugin operation.' },
        name: { type: 'string', description: 'npm spec for install, or the koishi.yml plugin key for uninstall/enable/disable.' },
        restart: { type: 'boolean', description: 'Restart Koishi after the change.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: textOutput(),
    execute: async (args) => {
      const action = String(args?.action ?? 'list')
      if (action === 'list') {
        const list = await plugins.list()
        return { text: list.map((plugin) => `${plugin.enabled ? '✓' : '✗'} ${plugin.key}${plugin.version ? ` @${plugin.version}` : ''}`).join('\n') || '没有检测到插件' }
      }
      const restart = args?.restart === true
      const spec = typeof args?.name === 'string' ? args.name.trim() : ''
      if (spec === '') throw new Error('name is required')
      const result = await serialize(async () => {
        if (action === 'install') return plugins.install(spec, { restart })
        if (action === 'uninstall') return plugins.uninstall(spec, { restart })
        return plugins.toggle(spec, action === 'enable', { restart })
      })
      return { text: result?.ok === false ? `失败：${result.error ?? ''}` : `${action} 完成${result?.key ? `：${result.key}` : ''}${restart ? '（已重启 Koishi）' : ''}` }
    },
  })

  ctx.tools.register({
    name: 'qqbot_access',
    description: 'Read or replace the QQ bot access policy: which groups may message the bot (inbound), which groups it may send to (outbound), and quiet mode. The policy is enforced by the Koishi access-control plugin and written to the Koishi project data/access.json.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'set'], description: 'Read the current policy or replace it.' },
        policy: { type: 'object', description: 'Full policy object when action=set (inbound/outbound modes, ids, quiet).' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: textOutput(),
    execute: async (args) => {
      const file = accessPath(settings)
      if (String(args?.action ?? 'get') === 'get') {
        const { policy, exists } = await readPolicy(file)
        const summary = summarizePolicy(policy)
        return { text: renderAccess(summary, file, exists) }
      }
      const raw = args?.policy
      if (raw === null || typeof raw !== 'object') throw new Error('policy object is required for action=set')
      const normalized = normalizePolicy(raw, { stamp: true })
      await serialize(() => writePolicy(file, normalized))
      return { text: `已更新权限策略：${renderAccess(summarizePolicy(normalized), file, true)}` }
    },
  })

  ctx.tools.register({
    name: 'qqbot_logs',
    description: 'Read the tail of the managed Koishi process log.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['koishi', 'napcat'], description: 'Log source.' },
        lines: { type: 'number', description: 'How many trailing lines (1-2000).' },
      },
      additionalProperties: false,
    },
    output: textOutput(),
    execute: async (args) => {
      const source = String(args?.source ?? 'koishi')
      const lines = clampInt(args?.lines, settings.logLines, 1, 2000)
      if (source === 'napcat') return { text: 'NapCat 日志请打开 NapCat WebUI → 日志 查看' }
      const tail = await koishi.logs(lines)
      return { text: tail.length === 0 ? '暂无日志（Koishi 可能不是由本插件启动）' : tail.join('\n') }
    },
  })

  ctx.systemPrompt.section({
    name: 'tool:qqbot',
    order: 2380,
    text: 'QQ bot control center: qqbot_status reads the local QQ/NapCat/Koishi state; qqbot_control starts/stops NapCat or Koishi; qqbot_configure writes the OneBot reverse WebSocket config; qqbot_plugin lists/installs/enables/uninstalls Koishi plugins; qqbot_logs tails the managed Koishi process. '
      + 'NapCat is a GUI application: installing it opens the official macOS installer, and logging into QQ still needs the user to scan the QR code. '
      + 'Never expose tokens; the panel and tools mask secrets.',
  })

  logger.info(`QQ bot control center ready; koishi=${settings.projectDir} napcat=${settings.napcatPort}`)
}

// --------------------------------------------------------------- utilities --

/** Send a JSON response. */
function sendJson(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.length),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** Method guard + async error wrapper for route handlers. */
function only(req, res, methods, handler) {
  if (!methods.includes(req.method ?? 'GET')) {
    sendJson(res, 405, { ok: false, error: `method not allowed: ${req.method}` })
    return
  }
  void Promise.resolve()
    .then(handler)
    .catch((error) => {
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: errorText(error?.message ?? error) })
    })
}

/** Read and parse a JSON request body (empty body -> {}). */
function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolvePromise, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (text === '') {
        resolvePromise({})
        return
      }
      try {
        resolvePromise(JSON.parse(text))
      } catch (error) {
        reject(new Error(`invalid JSON body: ${errorText(error?.message ?? error)}`))
      }
    })
    req.on('error', reject)
  })
}

/** Read a query parameter from a Node request URL. */
function urlParam(req, name) {
  try {
    return new URL(req.url ?? '/', 'http://localhost').searchParams.get(name)
  } catch {
    return null
  }
}

/** Safely read a string field from an unknown object. */
function stringField(value, name) {
  if (value === null || typeof value !== 'object') return ''
  const field = value[name]
  return typeof field === 'string' ? field.trim() : ''
}

/** Clamp an integer candidate. */
function clampInt(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isInteger(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

/** Run a synchronous detector, falling back on error. */
function safeDetect(fn, fallback) {
  try {
    return fn() ?? fallback
  } catch {
    return fallback
  }
}

/** Human-readable status used by the qqbot_status tool. */
function renderStatus(snapshot) {
  const napcat = snapshot?.napcat ?? {}
  const koishi = snapshot?.koishi ?? {}
  const qq = snapshot?.qq ?? {}
  const bot = snapshot?.bot ?? {}
  return [
    `QQ: ${qq.installed ? `已安装${qq.version ? ` (${qq.version})` : ''}` : '未安装'}`,
    `NapCat: ${napcat.installed ? `已安装${napcat.version ? ` v${napcat.version}` : ''}` : '未安装'} · ${napcat.running ? '运行中' : '未运行'}${napcat.loggedIn ? ` · 已登录${napcat.qq ? ` ${napcat.qq}` : ''}` : ''}`,
    `Koishi: ${koishi.exists === false ? '项目不存在' : koishi.running ? `运行中${koishi.managed ? '（本插件管理）' : ''}` : '未运行'} · 端口 ${snapshot?.settings?.koishiPort ?? '?'}`,
    `机器人: ${bot.online ? `在线${bot.selfId ? ` (${bot.selfId})` : ''}` : '离线'}`,
    `插件统计: ${(snapshot?.features ?? []).find((feature) => feature.id === 'koishi-plugins')?.status?.enabled ?? '?'} 启用`,
    `权限: 接收 ${renderScope((snapshot?.features ?? []).find((feature) => feature.id === 'access')?.status?.inbound)} · 发送 ${renderScope((snapshot?.features ?? []).find((feature) => feature.id === 'access')?.status?.outbound)}${(snapshot?.features ?? []).find((feature) => feature.id === 'access')?.status?.quiet ? ' · 安静模式' : ''}`,
  ].join('\n')
}


/** Render one access scope for the status tool. */
function renderScope(scope) {
  if (scope === undefined || scope === null) return '未知'
  const labels = { all: '全部', whitelist: '白名单', blacklist: '黑名单' }
  const label = labels[scope.groups] ?? String(scope.groups ?? '未知')
  const count = Number(scope.groupCount ?? 0)
  return count === 0 ? label : `${label}(${count})`
}

/** Render a policy summary for the qqbot_access tool. */
function renderAccess(summary, file, exists) {
  const lines = [
    `接收：群=${renderScope(summary.inbound)}，私聊=${summary.inbound.private}`,
    `发送：群=${renderScope(summary.outbound)}，私聊=${summary.outbound.private}`,
    `安静模式：${summary.inbound.quiet ? `开启（前缀 ${summary.inbound.prefixes.join(' ')}）` : '关闭'}`,
    `策略文件：${file}${exists ? '' : '（尚未创建，默认全部放行）'}`,
  ]
  return lines.join('\n')
}
