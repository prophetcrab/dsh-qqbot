/**
 * One-click environment setup: scaffold Koishi, install dependencies, install
 * NapCat (from the bundled offline payload), apply the OneBot WS config, then
 * start both services. GUI-only steps (macOS App Management and QQ QR scan)
 * stay with the user; everything else is automated.
 */

/**
 * @param {{ api: object, setup: object }} options
 */
export async function runFullSetup({ api, setup }) {
  const platform = api.get('platform') ?? {}
  const napcat = api.get('napcat')
  const koishi = api.get('koishi')
  const logger = api.logger
  const steps = []
  const push = (step, result) => {
    const ok = result?.ok !== false
    steps.push({ step, ok, message: result?.message ?? result?.error ?? '', data: result?.data })
    return ok
  }

  push('koishi-project', await setup.ensureProject())
  const deps = await setup.installDeps()
  push('koishi-deps', deps)

  const support = typeof platform.platformInfo === 'function' ? platform.platformInfo() : { napcatSupported: false, label: 'Unsupported' }
  const napcatBefore = await napcat.status()
  if (support.napcatSupported !== true) {
    steps.push({ step: 'napcat-install', ok: true, skipped: true, message: `当前平台（${support.label}）暂不支持 NapCat 自动安装` })
  } else if (napcatBefore.installed !== true) {
    push('napcat-install', await napcat.install())
  } else {
    steps.push({ step: 'napcat-install', ok: true, skipped: true, message: `NapCat 已安装（${napcatBefore.version ?? '未知版本'}）` })
  }

  const napcatAfter = await napcat.status()
  if (napcatAfter.installed === true && Array.isArray(napcatAfter.accounts) && napcatAfter.accounts.length > 0) {
    push('napcat-configure', await napcat.configure())
  } else if (napcatAfter.installed === true) {
    steps.push({ step: 'napcat-configure', ok: true, skipped: true, message: '登录 QQ 后自动写入 OneBot 配置' })
  } else {
    steps.push({ step: 'napcat-configure', ok: true, skipped: true, message: '等待 NapCat 安装器完成安装' })
  }

  const login = await napcat.loginState().catch(() => null)
  if (login?.loggedIn === true && typeof login.qq === 'string' && login.qq !== '') {
    const synced = await setup.setKoishiSelfId(login.qq)
    push('koishi-selfid', {
      ok: synced.ok,
      message: synced.changed ? `已同步 QQ ${login.qq} 到 Koishi 配置` : 'Koishi selfId 已匹配',
    })
  }

  push('koishi-start', await koishi.start())
  let started = null
  if (napcatAfter.installed === true) {
    started = await napcat.start()
    push('napcat-start', started)
  } else {
    steps.push({ step: 'napcat-start', ok: true, skipped: true, message: '等待 NapCat 安装完成' })
  }
  const loggedIn = started?.loggedIn === true || login?.loggedIn === true
  logger.info('一键安装完成: %s', steps.map((step) => `${step.step}=${step.ok ? 'ok' : 'fail'}`).join(', '))
  return {
    ok: steps.every((step) => step.ok !== false),
    steps,
    ready: deps.ok === true || deps.alreadyInstalled === true,
    napcatInstalled: napcatAfter.installed === true,
    loggedIn,
    message: napcatAfter.installed !== true
      ? 'Koishi 已就绪；NapCat 安装器已打开，完成安装后再点一次「一键安装并配置」'
      : loggedIn
        ? '环境已就绪，机器人已登录'
        : '环境已就绪；请用手机扫描二维码登录 QQ，登录后自动写入 OneBot 配置',
  }
}
