/**
 * In-memory progress for the NapCat image installer. The panel polls this
 * while the installer downloads the ~594 MB GitHub archive and docker-loads it.
 */

const PHASES = new Set(['idle', 'starting', 'checking-engine', 'downloading', 'verifying', 'loading', 'checking-image', 'pulling', 'done', 'failed'])

export class InstallProgress {
  constructor() {
    this.state = {
      active: false,
      phase: 'idle',
      bytes: 0,
      total: 0,
      percent: 0,
      message: '',
      startedAt: null,
      finishedAt: null,
      error: null,
    }
  }

  start(total = 0) {
    this.state = {
      active: true,
      phase: 'starting',
      bytes: 0,
      total: Number.isFinite(total) && total > 0 ? total : 0,
      percent: 0,
      message: '准备安装 NapCat 镜像',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
    }
  }

  update(patch = {}) {
    if (this.state.active !== true) return
    const next = { ...this.state, ...patch }
    if (!PHASES.has(next.phase)) next.phase = this.state.phase
    const bytes = Number(next.bytes) > 0 ? Number(next.bytes) : 0
    const total = Number(next.total) > 0 ? Number(next.total) : this.state.total
    next.bytes = bytes
    next.total = total
    const explicit = Number(next.percent)
    next.percent = Number.isFinite(explicit) && explicit >= 0
      ? Math.max(0, Math.min(100, Math.round(explicit)))
      : total > 0 ? Math.max(0, Math.min(100, Math.round((bytes / total) * 100))) : 0
    this.state = next
  }

  finish(error = null) {
    this.state = {
      ...this.state,
      active: false,
      phase: error === null || error === undefined ? 'done' : 'failed',
      percent: error === null || error === undefined ? 100 : this.state.percent,
      error: error === null || error === undefined ? null : String(error),
      finishedAt: new Date().toISOString(),
    }
  }

  snapshot() {
    return { ...this.state }
  }
}
