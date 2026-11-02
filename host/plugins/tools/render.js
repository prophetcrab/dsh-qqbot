import { describeScope } from '../../services/access/index.js'

/**
 * Human-readable renderers for the agent tools. Kept separate from tool wiring
 * so the wording can be unit-tested without a live host.
 */

/** Human-readable status used by the qqbot_status tool. */
export function renderStatus(snapshot) {
  const napcat = snapshot?.napcat ?? {}
  const koishi = snapshot?.koishi ?? {}
  const qq = snapshot?.qq ?? {}
  const bot = snapshot?.bot ?? {}
  return [
    `平台: ${snapshot?.platform?.label ?? '未知'}${snapshot?.platform?.arch ? ` · ${snapshot.platform.arch}` : ''}${snapshot?.platform?.napcatSupported === false ? '（不支持 NapCat 自动安装）' : ''}`,
    `AI: ${snapshot?.ai?.available === true ? `已接入 DSH（${snapshot.ai.provider}/${snapshot.ai.model}）` : '未接入 DSH LLM'}`,
    `QQ: ${qq.installed ? `已安装${qq.version ? ` (${qq.version})` : ''}` : '未安装'}`,
    `NapCat: ${napcat.installed ? `已安装${napcat.version ? ` v${napcat.version}` : ''}` : '未安装'} · ${napcat.running ? '运行中' : '未运行'}${napcat.loggedIn ? ` · 已登录${napcat.qq ? ` ${napcat.qq}` : ''}` : ''}`,
    `Koishi: ${koishi.exists === false ? '项目不存在' : koishi.running ? `运行中${koishi.managed ? '（本插件管理）' : ''}` : '未运行'} · 端口 ${snapshot?.settings?.koishiPort ?? '?'}`,
    `机器人: ${bot.online ? `在线${bot.selfId ? ` (${bot.selfId})` : ''}` : '离线'}`,
    `插件统计: ${(snapshot?.features ?? []).find((feature) => feature.id === 'koishi-plugins')?.status?.enabled ?? '?'} 启用`,
    `权限: 接收 ${describeScope((snapshot?.features ?? []).find((feature) => feature.id === 'access')?.status?.inbound)} · 发送 ${describeScope((snapshot?.features ?? []).find((feature) => feature.id === 'access')?.status?.outbound)}${(snapshot?.features ?? []).find((feature) => feature.id === 'access')?.status?.quiet ? ' · 安静模式' : ''}`,
  ].join('\n')
}
