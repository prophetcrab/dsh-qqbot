/**
 * NapCat service: detect, install, configure and control the macOS QQ client
 * that NapCat patches. The public class is a thin dispatcher over focused
 * modules (detect/snapshot/webui/configure/lifecycle/offline).
 *
 * Every side effect is behind the injectable dependency seam (`run`, `http`,
 * `fs`, `platform`, `sleep`, `processKill`, `now`, `fetch`) so unit tests never
 * touch the real QQ process, NapCat configuration or network.
 */

import {
  ensureDir,
  existsSync,
  httpJson,
  readJson,
  readdir,
  run as execFileRun,
  sleep as sleepFor,
  writeFileAtomic,
} from '../../platform/mac/index.js'
import { normalizeLogger } from './common.js'
import { configure } from './configure.js'
import { qrImagePath } from './detect.js'
import { install, start, stop } from './lifecycle.js'
import { status } from './snapshot.js'
import { loginState, loginStatus, refreshQr } from './webui.js'
import {
  detectNapcat,
  detectQq,
  findProcess,
  hostPlatform,
  killPid,
  napcatQrPath,
  resolveSettings,
} from '../../platform/mac/index.js'

/** Default filesystem seam; tests may override individual members. */
const defaultFs = {
  existsSync,
  ensureDir,
  readJson,
  readdir,
  writeFile: writeFileAtomic,
  writeFileAtomic,
}

/** Default platform seam; read-only helpers from the platform layer. */
const defaultPlatform = { detectNapcat, detectQq, findProcess, hostPlatform, killPid, napcatQrPath }

/**
 * Owns every NapCat side effect for the QQ bot control center.
 */


export class NapcatManager {
  constructor(options = {}) {
    const source = options !== null && typeof options === 'object' ? options : {}
    this.settings = resolveSettings(source.settings !== null && typeof source.settings === 'object' ? source.settings : {})
    this.logger = normalizeLogger(source.logger)
    this.deps = source.deps !== null && typeof source.deps === 'object' ? source.deps : {}
    this.fs = { ...defaultFs, ...(source.deps?.fs !== null && typeof source.deps?.fs === 'object' ? source.deps.fs : {}) }
    this.platform = { ...defaultPlatform, ...(source.deps?.platform !== null && typeof source.deps?.platform === 'object' ? source.deps.platform : {}) }
    this.run = typeof this.deps.run === 'function' ? this.deps.run : execFileRun
    this.http = typeof this.deps.http === 'function' ? this.deps.http : httpJson
    this.sleep = typeof this.deps.sleep === 'function' ? this.deps.sleep : sleepFor
    this.now = typeof this.deps.now === 'function' ? this.deps.now : Date.now
    this.processKill = typeof this.deps.processKill === 'function'
      ? this.deps.processKill
      : (pid, signal) => process.kill(pid, signal)
    this.fetch = typeof this.deps.fetch === 'function'
      ? this.deps.fetch
      : (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null)
    /** @type {{ credential: string, port: number, tokenHash: string, expiresAt: number }|null} */
    this.auth = null
    /** Whether the last WebUI API call reached the server at all. */
    this.webuiReachable = false
  }

  /** Full read-only snapshot for the panel. */
  async status() {
    return status(this)
  }

  /** Install NapCat from the bundled offline payload. */
  async install() {
    return install(this)
  }

  /** Write the OneBot reverse WebSocket client into every account config. */
  async configure(options = {}) {
    return configure(this, options)
  }

  /** Launch NapCat and wait until it reports a logged-in QQ account. */
  async start(options = {}) {
    return start(this, options)
  }

  /** Stop the QQ process (SIGTERM, then SIGKILL). */
  async stop(options = {}) {
    return stop(this, options)
  }

  /** Read the QQ login state through the NapCat WebUI API. */
  async loginStatus() {
    return loginStatus(this)
  }

  /** Login state for the panel: QR phase, QR availability and account. */
  async loginState() {
    return loginState(this)
  }

  /** Ask NapCat's WebUI to refresh the login QR code. */
  async refreshQr() {
    return refreshQr(this)
  }

  /** Path of NapCat's cached login QR image. */
  qrImagePath() {
    return qrImagePath(this)
  }
}
