import { join } from 'node:path'

/** Adopt a running Koishi only when the port owner is this project's CLI. */
export async function adoptKoishiProcess({ manager, findPortPid, findProcess, projectDir, logger }) {
  if (manager.managedPid !== null) return true
  const pid = await findPortPid(manager.port)
  if (pid === null) return false
  const found = findProcess(join(projectDir, 'node_modules', 'koishi'))
  if (found === null || typeof found !== 'object' || found.running !== true || found.pid !== pid) return false
  manager.managedPid = pid
  manager.startedAt = new Date().toISOString()
  logger.info('已接管当前项目的 Koishi 进程（pid=%s）', pid)
  return true
}
