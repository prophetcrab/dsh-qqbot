/**
 * Watchdog process: outlive a crashed/killed DSH host and make sure the bot is
 * fully offline (Koishi process gone, NapCat container stopped).
 *
 * Configuration arrives through `DSH_QQBOT_WATCHDOG` (JSON) so the watchdog
 * command line never contains the project path. It polls the DSH host PID; on
 * exit it stops the compose service and kills this project's Koishi processes.
 *
 * This file runs as a plain Node script (`ELECTRON_RUN_AS_NODE=1` when the host
 * is Electron), independent of the host's module graph.
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'

const POLL_MS = 1000
const COMMAND_TIMEOUT_MS = 60_000

/** Run an argv command without throwing; resolves regardless of exit code. */
function run(file, args, timeoutMs = COMMAND_TIMEOUT_MS) {
  return new Promise((resolvePromise) => {
    try {
      execFile(file, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
        resolvePromise({ code: error === null ? 0 : 1, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
      })
    } catch {
      resolvePromise({ code: 1, stdout: '', stderr: '' })
    }
  })
}

/** Whether a process id is still alive. */
function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Stop the NapCat compose service, if the generated compose exists. */
async function stopCompose(composePath) {
  if (typeof composePath !== 'string' || composePath === '' || !existsSync(composePath)) return
  await run('docker', ['compose', '-f', composePath, 'stop'], 90_000)
}

/** Kill every Koishi process belonging to this exact project directory. */
async function stopKoishi(config) {
  const projectDir = typeof config.projectDir === 'string' ? config.projectDir : ''
  if (projectDir === '') return
  if (config.platform === 'windows') {
    const escaped = projectDir.replace(/\//gu, '\\').replace(/'/gu, "''")
    const script = [
      `$path = '${escaped}'`,
      'Get-CimInstance Win32_Process | Where-Object {',
      '  $_.CommandLine -and $_.CommandLine -like ("*" + $path + "*") -and',
      "  $_.CommandLine -match 'koishi' -and $_.ProcessId -ne $PID",
      '} | ForEach-Object { & taskkill /PID $_.ProcessId /T /F 2>$null | Out-Null }',
    ].join('\n')
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 30_000)
    return
  }
  const marker = `${projectDir}/node_modules/koishi`
  const result = await run('ps', ['-axo', 'pid=,command='], 10_000)
  if (result.code !== 0) return
  for (const line of result.stdout.split(/\r?\n/u)) {
    const match = /^\s*(\d+)\s+(.*)$/u.exec(line)
    if (match === null || !match[2].includes(marker)) continue
    try {
      process.kill(Number(match[1]), 'SIGKILL')
    } catch {
      // already gone
    }
  }
}

/** Stop Koishi first, then the NapCat container. */
async function cleanup(config) {
  await stopKoishi(config)
  await stopCompose(config.composePath)
}

function parseConfig() {
  const raw = process.env.DSH_QQBOT_WATCHDOG
  if (typeof raw !== 'string' || raw === '') return null
  try {
    const config = JSON.parse(raw)
    return config !== null && typeof config === 'object' ? config : null
  } catch {
    return null
  }
}

const config = parseConfig()
if (config === null || !Number.isInteger(Number(config.parentPid)) || Number(config.parentPid) <= 0) {
  process.exit(0)
}
const parentPid = Number(config.parentPid)

let finishing = false
const timer = setInterval(() => {
  if (finishing || alive(parentPid)) return
  finishing = true
  clearInterval(timer)
  cleanup(config)
    .catch(() => {})
    .finally(() => process.exit(0))
}, POLL_MS)
