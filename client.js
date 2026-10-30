/**
 * dsh-qqbot — browser half.
 *
 * A sidebar row plus a full-width control center for the local QQ bot stack.
 * The panel renders whatever the Host returns: status pills, the NapCat and
 * Koishi overview cards, lifecycle/setup actions, the Koishi plugin manager,
 * the extensible feature board, and the managed process log.
 *
 * The client never guesses ports or paths: everything comes from
 * `GET /qqbot/status`. Mutations are JSON POSTs, buttons disable while a
 * request is in flight, and failures surface in a banner at the top.
 */
window.__ModuleLoader__.load({
  id: 'dsh-qqbot',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'qqbot'
    const PANEL_ID = 'qqbot'
    const SIDEBAR_ID = 'qqbot'
    /** Status polling interval; the Host route is cheap and read-only. */
    const POLL_MS = 4000
    /** Log tail size requested from GET /qqbot/logs. */
    const LOG_LINES = 200

    const en = {
      __lang: 'en',
      title: 'QQ bot',
      eyebrow: 'Control center',
      subtitle: 'NapCat and Koishi in one panel: install, configure, start and stop, manage plugins, read logs.',
      refresh: 'Refresh',
      loading: 'Reading status…',
      loadFail: 'Could not load the status',
      retry: 'Retry',
      updated: 'Updated',
      tabOverview: 'Overview',
      tabAccess: 'Access',
      tabPlugins: 'Plugins',
      tabFeatures: 'Features',
      tabLogs: 'Logs',
      pillNapcat: 'NapCat',
      pillKoishi: 'Koishi',
      pillBot: 'Bot',
      stInstalled: 'Installed',
      stMissing: 'Not installed',
      stRunning: 'Running',
      stStopped: 'Stopped',
      stLoggedIn: 'Signed in',
      stLoggedOut: 'Not signed in',
      stOnline: 'Online',
      stOffline: 'Offline',
      stMissingProject: 'Project missing',
      stApplied: 'Applied',
      stNotApplied: 'Not applied',
      stReachable: 'reachable',
      stUnreachable: 'unreachable',
      actionsTitle: 'Operations',
      startAll: 'Start everything',
      stopAll: 'Stop everything',
      installNapcat: 'Install NapCat',
      configureNapcat: 'Apply OneBot config',
      installDeps: 'Install Koishi deps',
      napcatStart: 'Start NapCat',
      napcatStop: 'Stop NapCat',
      koishiStart: 'Start Koishi',
      koishiStop: 'Stop Koishi',
      koishiRestart: 'Restart Koishi',
      napcatTitle: 'NapCat',
      koishiTitle: 'Koishi',
      lblInstall: 'Installation',
      lblVersion: 'Version',
      lblProcess: 'Process',
      lblLogin: 'Login',
      lblWebui: 'WebUI',
      lblConfig: 'OneBot config',
      lblAccounts: 'Accounts',
      lblWs: 'Reverse WS',
      lblProject: 'Project',
      lblDeps: 'Dependencies',
      lblPort: 'Port',
      lblOnline: 'Bot',
      lblStats: 'Stats',
      lblError: 'Error',
      managed: 'managed by this plugin',
      noWs: 'none configured',
      installNapcatHint: 'The official installer opens: authorize it in the GUI, then apply the OneBot config.',
      pluginsTitle: 'Koishi plugins',
      pluginsEmpty: 'No plugin was found in koishi.yml.',
      plName: 'Name',
      plVersion: 'Version',
      plGroup: 'Group',
      plEnabled: 'Enabled',
      plActions: 'Actions',
      plLocal: 'local',
      plEnable: 'Enable',
      plDisable: 'Disable',
      plUninstall: 'Uninstall',
      plConfirm: 'Confirm',
      plInstall: 'Install',
      plInstalling: 'Installing…',
      plInstallPlaceholder: 'npm spec, e.g. koishi-plugin-puppeteer',
      plRestartHint: 'Edits are written to koishi.yml; restart Koishi to apply them.',
      plRestartAfter: 'Restart Koishi after changes',
      refreshPlugins: 'Refresh plugins',
      loadingPlugins: 'Loading plugins…',
      loadPluginsFail: 'Could not load plugins',
      featuresTitle: 'Capabilities',
      featuresEmpty: 'No feature is registered.',
      featuresNote: `Other DSH plugins can extend this panel with inject: ['qqbot'] and ctx.qqbot.registerFeature().`,
      featuresRefresh: 'Refresh features',
      loadingFeatures: 'Loading features…',
      loadFeaturesFail: 'Could not load features',
      logsTitle: 'Logs',
      logsKoishi: 'Koishi',
      logsNapcat: 'NapCat',
      logsEmpty: 'No log lines yet.',
      logsLoading: 'Loading logs…',
      logsRefresh: 'Refresh logs',
      loadLogsFail: 'Could not load logs',
      accessTitle: 'Access policy',
      accessInboundTitle: 'Inbound',
      accessInboundDesc: 'Which groups and private chats the bot processes.',
      accessOutboundTitle: 'Outbound',
      accessOutboundDesc: 'Which groups and private chats the bot may send to.',
      accessMode: 'Mode',
      accessModeAll: 'All',
      accessModeWhitelist: 'Whitelist',
      accessModeBlacklist: 'Blacklist',
      accessGroups: 'Group IDs',
      accessGroupsPlaceholder: 'One per line or comma separated, e.g. 123456, 234567',
      accessGroupsModeHint: 'all = every group, whitelist = only listed, blacklist = all except listed.',
      accessPrivate: 'Allow private chats',
      accessPrivateOnHint: 'When on, every private chat is processed.',
      accessPrivateOffHint: 'When off, all private chats are muted.',
      accessQuietTitle: 'Quiet mode',
      accessQuiet: 'In groups, only respond to command prefixes or @mentions',
      accessQuietHint: 'When on, other group messages are ignored.',
      accessPrefixes: 'Command prefixes',
      accessPrefixesPlaceholder: 'Space or comma separated, e.g. / !',
      accessPrefixesHint: 'Empty means the default "/".',
      accessSave: 'Save policy',
      accessSaved: 'Access policy saved.',
      accessLoading: 'Loading access policy…',
      accessLoadFail: 'Could not load the access policy',
      accessNote: 'Inbound and outbound lists are independent: an inbound whitelist avoids handling unrelated group messages, while an outbound whitelist stops sending to unauthorized groups.',
      actionDone: 'Done.',
      actionFailed: 'Action failed',
      working: 'Working…',
    }

    const zh = {
      __lang: 'zh',
      title: 'QQ 机器人',
      eyebrow: '控制中心',
      subtitle: 'NapCat 与 Koishi 一站式控制：安装、配置、启停、插件管理与日志。',
      refresh: '刷新',
      loading: '正在读取状态…',
      loadFail: '状态读取失败',
      retry: '重试',
      updated: '更新于',
      tabOverview: '概览',
      tabAccess: '权限',
      tabPlugins: '插件',
      tabFeatures: '功能',
      tabLogs: '日志',
      pillNapcat: 'NapCat',
      pillKoishi: 'Koishi',
      pillBot: '机器人',
      stInstalled: '已安装',
      stMissing: '未安装',
      stRunning: '运行中',
      stStopped: '未运行',
      stLoggedIn: '已登录',
      stLoggedOut: '未登录',
      stOnline: '在线',
      stOffline: '离线',
      stMissingProject: '项目不存在',
      stApplied: '已应用',
      stNotApplied: '未应用',
      stReachable: '可达',
      stUnreachable: '不可达',
      actionsTitle: '操作',
      startAll: '一键启动全部',
      stopAll: '全部停止',
      installNapcat: '安装 NapCat',
      configureNapcat: '写入 OneBot 配置',
      installDeps: '安装 Koishi 依赖',
      napcatStart: '启动 NapCat',
      napcatStop: '停止 NapCat',
      koishiStart: '启动 Koishi',
      koishiStop: '停止 Koishi',
      koishiRestart: '重启 Koishi',
      napcatTitle: 'NapCat',
      koishiTitle: 'Koishi',
      lblInstall: '安装',
      lblVersion: '版本',
      lblProcess: '进程',
      lblLogin: '登录',
      lblWebui: 'WebUI',
      lblConfig: 'OneBot 配置',
      lblAccounts: '账号',
      lblWs: '反向 WS',
      lblProject: '项目',
      lblDeps: '依赖',
      lblPort: '端口',
      lblOnline: '机器人',
      lblStats: '统计',
      lblError: '错误',
      managed: '由本插件启动',
      noWs: '未配置',
      installNapcatHint: '会打开官方安装器：请按提示完成授权，然后写入 OneBot 配置。',
      pluginsTitle: 'Koishi 插件',
      pluginsEmpty: 'koishi.yml 里没有检测到插件。',
      plName: '名称',
      plVersion: '版本',
      plGroup: '分组',
      plEnabled: '已启用',
      plActions: '操作',
      plLocal: '本地',
      plEnable: '启用',
      plDisable: '禁用',
      plUninstall: '卸载',
      plConfirm: '确认',
      plInstall: '安装',
      plInstalling: '安装中…',
      plInstallPlaceholder: 'npm 包名，例如 koishi-plugin-puppeteer',
      plRestartHint: '修改写入 koishi.yml，重启 Koishi 后生效。',
      plRestartAfter: '操作后重启 Koishi',
      refreshPlugins: '刷新插件',
      loadingPlugins: '正在读取插件…',
      loadPluginsFail: '插件读取失败',
      featuresTitle: '功能',
      featuresEmpty: '暂无注册的功能。',
      featuresNote: `其他 DSH 插件可通过 inject: ['qqbot'] 与 ctx.qqbot.registerFeature() 扩展。`,
      featuresRefresh: '刷新功能',
      loadingFeatures: '正在读取功能…',
      loadFeaturesFail: '功能读取失败',
      logsTitle: '日志',
      logsKoishi: 'Koishi',
      logsNapcat: 'NapCat',
      logsEmpty: '暂无日志。',
      logsLoading: '正在读取日志…',
      logsRefresh: '刷新日志',
      loadLogsFail: '日志读取失败',
      accessTitle: '权限策略',
      accessInboundTitle: '接收',
      accessInboundDesc: '机器人处理哪些群与私聊的消息。',
      accessOutboundTitle: '发送',
      accessOutboundDesc: '机器人允许向哪些群与私聊发消息。',
      accessMode: '模式',
      accessModeAll: '全部',
      accessModeWhitelist: '白名单',
      accessModeBlacklist: '黑名单',
      accessGroups: '群号',
      accessGroupsPlaceholder: '每行一个或逗号分隔，例如 123456, 234567',
      accessGroupsModeHint: 'all=全部群，whitelist=仅名单内，blacklist=名单除外。',
      accessPrivate: '允许私聊',
      accessPrivateOnHint: '开启后所有私聊都会被处理。',
      accessPrivateOffHint: '关闭后私聊全部静默。',
      accessQuietTitle: '静默模式',
      accessQuiet: '群里只响应指令前缀或 @机器人',
      accessQuietHint: '开启后群里其他消息将被忽略。',
      accessPrefixes: '指令前缀',
      accessPrefixesPlaceholder: '空格或逗号分隔，例如 / !',
      accessPrefixesHint: '留空时默认使用 "/"。',
      accessSave: '保存策略',
      accessSaved: '权限策略已保存。',
      accessLoading: '正在读取权限策略…',
      accessLoadFail: '权限策略读取失败',
      accessNote: '接收与发送名单相互独立：接收白名单可避免机器人处理无关群消息，发送白名单阻止向未授权群发消息。',
      actionDone: '操作完成。',
      actionFailed: '操作失败',
      working: '处理中…',
    }

    const CSS = `
.qqbot-page { box-sizing: border-box; width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden;
  max-width: 1120px; margin: 0 auto; padding: 24px 28px 64px; display: flex; flex-direction: column; gap: 16px;
  background: radial-gradient(80% 40% at 100% 0%, color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent), transparent 70%),
              var(--dsw-alias-bg-base); }
.qqbot-page *, .qqbot-page *::before, .qqbot-page *::after { box-sizing: border-box; }
/* Keep sections at their natural height: a flex child with overflow hidden collapses. */
.qqbot-page > * { flex: 0 0 auto; min-height: 0; }
.qqbot-page button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }

.qqbot-hero { border: 0.5px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, var(--dsw-alias-border-l1));
  border-radius: 20px; padding: 22px 26px; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px;
  background: radial-gradient(120% 160% at 100% 0%, color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent), transparent 60%),
              var(--dsw-alias-bg-layer-1); }
.qqbot-hero-main { min-width: 0; }
.qqbot-hero-side { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; flex: none; }
.qqbot-eyebrow { display: inline-flex; align-items: center; gap: 7px; font-size: 10.5px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--dsw-alias-brand-primary); font-weight: 500; }
.qqbot-eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
.qqbot-title { margin: 8px 0 0; font-size: 25px; line-height: 1.16; font-weight: 500; letter-spacing: -0.015em;
  color: var(--dsw-alias-label-primary); }
.qqbot-sub { margin: 8px 0 0; font-size: 12.5px; line-height: 1.55; color: var(--dsw-alias-label-secondary); max-width: 64ch; }

.qqbot-pills { display: flex; flex-wrap: wrap; gap: 7px; justify-content: flex-end; }
.qqbot-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; padding: 4px 10px;
  border-radius: 999px; border: 0.5px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary);
  white-space: nowrap; }
.qqbot-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.qqbot-pill-label { opacity: .8; }
.qqbot-pill-ok { color: var(--dsw-alias-state-success-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, var(--dsw-alias-border-l1)); }
.qqbot-pill-warn { color: var(--dsw-alias-state-warn-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, var(--dsw-alias-border-l1)); }
.qqbot-pill-bad { color: var(--dsw-alias-state-error-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, var(--dsw-alias-border-l1)); }

.qqbot-btn { appearance: none; border: 0.5px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; padding: 7px 13px; border-radius: 10px;
  cursor: pointer; white-space: nowrap; transition: transform .15s ease, border-color .15s ease, background .15s ease; }
.qqbot-btn:hover:not(:disabled) { transform: translateY(-1px); border-color: var(--dsw-alias-brand-primary); }
.qqbot-btn:disabled { opacity: .55; cursor: default; }
.qqbot-btn-primary { border-color: transparent; background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-label-primary-inverted, #fff); font-weight: 500; }
.qqbot-btn-danger { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, var(--dsw-alias-border-l1));
  color: var(--dsw-alias-state-error-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, var(--dsw-alias-bg-layer-1)); }
.qqbot-btns { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

.qqbot-banner { border-radius: 12px; padding: 9px 14px; font-size: 12px; line-height: 1.5;
  border: 0.5px solid var(--dsw-alias-border-l1); }
.qqbot-banner-error { color: var(--dsw-alias-state-error-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, var(--dsw-alias-border-l1));
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, var(--dsw-alias-bg-layer-1)); }
.qqbot-banner-ok { color: var(--dsw-alias-state-success-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, var(--dsw-alias-border-l1));
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, var(--dsw-alias-bg-layer-1)); }
.qqbot-warn { margin: 0; font-size: 11.5px; color: var(--dsw-alias-state-warn-primary); }
.qqbot-error { margin: 0; font-size: 11.5px; color: var(--dsw-alias-state-error-primary); line-height: 1.5; }
.qqbot-hint { margin: 0; font-size: 11.5px; line-height: 1.55; color: var(--dsw-alias-label-tertiary); }
.qqbot-empty { border: 0.5px dashed var(--dsw-alias-border-l1); border-radius: 14px; padding: 22px;
  text-align: center; font-size: 12.5px; color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1); display: flex; flex-direction: column; align-items: center; gap: 10px; }

.qqbot-tabs { display: inline-flex; gap: 2px; padding: 3px; border-radius: 12px; align-self: flex-start;
  border: 0.5px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 80%, transparent); }
.qqbot-tab { appearance: none; border: none; background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12px; padding: 6px 14px; border-radius: 9px; cursor: pointer; transition: all .15s ease; }
.qqbot-tab:hover { color: var(--dsw-alias-label-primary); }
.qqbot-tab.active { background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-inverted, #fff);
  font-weight: 500; }

.qqbot-body { display: flex; flex-direction: column; gap: 14px; min-height: 0; }
.qqbot-stack { display: flex; flex-direction: column; gap: 14px; }
.qqbot-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.qqbot-card { border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 16px; background: var(--dsw-alias-bg-layer-1);
  padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.qqbot-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.qqbot-card-title { margin: 0; font-size: 13.5px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.qqbot-card-sub { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.qqbot-feature-head { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.qqbot-rows { display: flex; flex-direction: column; gap: 7px; }
.qqbot-row-item { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; font-size: 11.5px; }
.qqbot-row-label { color: var(--dsw-alias-label-tertiary); flex: none; }
.qqbot-row-value { color: var(--dsw-alias-label-primary); text-align: right; min-width: 0; overflow-wrap: anywhere; }
.qqbot-row-value.is-ok { color: var(--dsw-alias-state-success-primary); }
.qqbot-row-value.is-warn { color: var(--dsw-alias-state-warn-primary); }
.qqbot-row-value.is-bad { color: var(--dsw-alias-state-error-primary); }
.qqbot-actions-row { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
.qqbot-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px;
  word-break: break-all; }

.qqbot-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
.qqbot-toolbar-left, .qqbot-toolbar-right { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.qqbot-seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px;
  border: 0.5px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.qqbot-seg-btn { appearance: none; border: none; background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 11.5px; padding: 5px 11px; border-radius: 8px; cursor: pointer; }
.qqbot-seg-btn.active { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-weight: 500; }
.qqbot-check { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px;
  color: var(--dsw-alias-label-secondary); cursor: pointer; }
.qqbot-check input { accent-color: var(--dsw-alias-brand-primary); }

.qqbot-input { flex: 1 1 260px; min-width: 200px; font: inherit; font-size: 12px;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 9px; padding: 7px 10px; }
.qqbot-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }

.qqbot-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.qqbot-table th { text-align: left; font-weight: 500; font-size: 11px; color: var(--dsw-alias-label-tertiary);
  padding: 6px 10px; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.qqbot-table td { padding: 8px 10px; border-bottom: 0.5px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary); vertical-align: middle; }
.qqbot-table tr:last-child td { border-bottom: none; }
.qqbot-table tbody tr:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, transparent); }
.qqbot-plugin-name { color: var(--dsw-alias-label-primary); font-weight: 500; margin-right: 6px; }
.qqbot-plugin-package { display: block; color: var(--dsw-alias-label-tertiary); margin-top: 2px; }
.qqbot-badge { font-size: 10px; padding: 1px 6px; border-radius: 999px;
  border: 0.5px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
.qqbot-switch { appearance: none; display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 11px;
  padding: 3px 9px; border-radius: 999px; border: 0.5px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); cursor: pointer; white-space: nowrap; }
.qqbot-switch[aria-checked="true"] { color: var(--dsw-alias-state-success-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, var(--dsw-alias-border-l1));
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, var(--dsw-alias-bg-layer-2)); }
.qqbot-switch:disabled { opacity: .55; cursor: default; }
.qqbot-switch-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.qqbot-feature-status { display: flex; flex-direction: column; gap: 5px;
  border-top: 0.5px dashed var(--dsw-alias-border-l1); padding-top: 9px; }
.qqbot-note { margin: 0; font-size: 11.5px; color: var(--dsw-alias-label-tertiary); line-height: 1.6;
  padding: 12px 14px; border-radius: 12px; border: 0.5px dashed var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 70%, transparent); }

.qqbot-pre { margin: 0; padding: 14px 16px; border-radius: 12px;
  border: 0.5px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
  max-height: 480px; overflow: auto; }
.qqbot-foot { display: flex; flex-wrap: wrap; gap: 14px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }

.qqbot-form { display: flex; flex-direction: column; gap: 12px; }
.qqbot-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.qqbot-field-label { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--dsw-alias-label-tertiary); }
.qqbot-field .qqbot-input, .qqbot-field .qqbot-select, .qqbot-field .qqbot-area {
  width: 100%; flex: 0 0 auto; box-sizing: border-box; }
.qqbot-select { font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2); border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: 9px; padding: 7px 9px; }
.qqbot-select:focus, .qqbot-area:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.qqbot-area { font: inherit; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2); border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: 9px; padding: 8px 10px; min-height: 76px; resize: vertical; }
.qqbot-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.qqbot-chip { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px;
  padding: 2px 8px; border-radius: 999px; border: 0.5px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); }
.qqbot-check-block { align-items: flex-start; }

@media (max-width: 860px) {
  .qqbot-grid { grid-template-columns: minmax(0, 1fr); }
  .qqbot-hero { flex-direction: column; }
  .qqbot-hero-side { align-items: flex-start; }
  .qqbot-pills { justify-content: flex-start; }
}
@media (max-width: 620px) {
  .qqbot-page { padding: 16px 14px 44px; }
  .qqbot-title { font-size: 21px; }
}
`

    /** Human-readable error text for a caught value. */
    function messageOf(error) {
      return String(error && error.message !== undefined ? error.message : error)
    }

    /**
     * JSON fetch wrapper. Every Host route answers `{ ok, ... }`; a transport
     * failure, a non-2xx status or `ok:false` all throw with a user-facing text.
     */
    async function requestJson(path, options) {
      const config = options || {}
      const init = {
        method: config.method || 'GET',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      }
      if (config.body !== undefined) {
        init.headers['content-type'] = 'application/json'
        init.body = JSON.stringify(config.body)
      }
      const response = await fetch(path, init)
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok) throw new Error(payload && payload.error ? payload.error : `HTTP ${response.status}`)
      if (payload !== null && payload.ok === false) throw new Error(payload.error ? payload.error : 'request failed')
      return payload
    }

    /** Pick the current language out of a `{ zh, en }` copy pair. */
    function pickText(value, lang) {
      if (typeof value === 'string') return value
      if (value === null || typeof value !== 'object') return ''
      const preferred = value[lang]
      if (typeof preferred === 'string' && preferred !== '') return preferred
      const fallback = value[lang === 'zh' ? 'en' : 'zh']
      return typeof fallback === 'string' ? fallback : ''
    }

    /** Render a nested status value as one short line. */
    function compactValue(value) {
      if (value === null || value === undefined) return '—'
      if (typeof value === 'string') return value === '' ? '—' : value
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
      if (Array.isArray(value)) return `${value.length}`
      try {
        const text = JSON.stringify(value)
        if (typeof text !== 'string') return '—'
        return text.length > 96 ? `${text.slice(0, 93)}…` : text
      } catch {
        return '—'
      }
    }

    /** The stable koishi.yml key of a PluginInfo row (the API may call it name). */
    function pluginKey(plugin) {
      if (plugin === null || typeof plugin !== 'object') return ''
      if (typeof plugin.key === 'string' && plugin.key !== '') return plugin.key
      if (typeof plugin.name === 'string') return plugin.name
      if (typeof plugin.packageName === 'string') return plugin.packageName
      return ''
    }

    /** Display name for a plugin row. */
    function pluginLabel(plugin) {
      if (plugin !== null && typeof plugin === 'object' && typeof plugin.name === 'string' && plugin.name !== '') return plugin.name
      return pluginKey(plugin)
    }

    /** Format an ISO timestamp without trusting its contents. */
    function formatTime(value) {
      if (typeof value !== 'string' || value === '') return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return value
      return date.toLocaleTimeString()
    }

    /** Scope modes accepted by the Host access policy. */
    const ACCESS_MODES = ['all', 'whitelist', 'blacklist']

    /** Fall back to `all` for unknown/missing modes. */
    function normalizeMode(value) {
      return ACCESS_MODES.includes(value) ? value : 'all'
    }

    /** Render a policy id list into the textarea form. */
    function idsText(ids) {
      return Array.isArray(ids) ? ids.map((id) => String(id)).join('\n') : ''
    }

    /**
     * Parse a textarea-style id list. Mirrors the Host parser (newlines,
     * spaces, commas including full-width variants; 5-15 digit ids only),
     * trims, drops non-numeric tokens and de-duplicates.
     */
    function parseIdList(text) {
      if (typeof text !== 'string' || text.trim() === '') return []
      const seen = new Set()
      for (const part of text.split(/[\s,，、;；]+/u)) {
        const id = part.trim()
        if (/^\d{5,15}$/u.test(id)) seen.add(id)
      }
      return [...seen]
    }

    /** Parse the quiet-mode prefix input the same way, without the digit rule. */
    function parsePrefixes(text) {
      if (typeof text !== 'string' || text.trim() === '') return []
      const seen = new Set()
      for (const part of text.split(/[\s,，、;；]+/u)) {
        const prefix = part.trim()
        if (prefix !== '') seen.add(prefix)
      }
      return [...seen]
    }

    /**
     * Turn an AccessPolicy payload into the editable draft. The private-chat
     * switches are two-state: on means `all`, off means an empty `whitelist`
     * (which mutes every private chat).
     */
    function draftFromPolicy(policy) {
      const source = policy !== null && typeof policy === 'object' ? policy : {}
      const inbound = source.inbound !== null && typeof source.inbound === 'object' ? source.inbound : {}
      const outbound = source.outbound !== null && typeof source.outbound === 'object' ? source.outbound : {}
      const quiet = inbound.quiet !== null && typeof inbound.quiet === 'object' ? inbound.quiet : {}
      const inboundGroups = inbound.groups !== null && typeof inbound.groups === 'object' ? inbound.groups : {}
      const inboundPrivate = inbound.private !== null && typeof inbound.private === 'object' ? inbound.private : {}
      const outboundGroups = outbound.groups !== null && typeof outbound.groups === 'object' ? outbound.groups : {}
      const outboundPrivate = outbound.private !== null && typeof outbound.private === 'object' ? outbound.private : {}
      return {
        inboundMode: normalizeMode(inboundGroups.mode),
        inboundGroups: idsText(inboundGroups.ids),
        inboundPrivate: inboundPrivate.mode === 'all',
        outboundMode: normalizeMode(outboundGroups.mode),
        outboundGroups: idsText(outboundGroups.ids),
        outboundPrivate: outboundPrivate.mode === 'all',
        quietEnabled: quiet.enabled === true,
        prefixes: Array.isArray(quiet.prefixes) ? quiet.prefixes.map((prefix) => String(prefix)).join(' ') : '',
      }
    }

    function QqbotIcon(props) {
      const size = props && props.size ? props.size : 18
      return h('svg', { viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': true, fill: 'none' },
        h('path', { d: 'M8 1.6v2', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
        h('circle', { cx: 8, cy: 1.4, r: 0.9, fill: 'currentColor' }),
        h('rect', { x: 2, y: 3.4, width: 12, height: 9.2, rx: 3, stroke: 'currentColor', strokeWidth: 1.2 }),
        h('circle', { cx: 5.7, cy: 7.4, r: 0.9, fill: 'currentColor' }),
        h('circle', { cx: 10.3, cy: 7.4, r: 0.9, fill: 'currentColor' }),
        h('path', { d: 'M5.8 10.2h4.4', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
        h('path', { d: 'M4.2 12.6l-.8 1.6 2.3-.8', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    function Panel(props) {
      const t = typeof (props && props.t) === 'function' ? props.t : (key) => String(key)
      const lang = t('__lang') === 'zh' ? 'zh' : 'en'

      const [tab, setTab] = React.useState('overview')
      const [snapshot, setSnapshot] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [loadError, setLoadError] = React.useState(null)
      const [banner, setBanner] = React.useState(null)
      const [plugins, setPlugins] = React.useState(null)
      const [pluginsPhase, setPluginsPhase] = React.useState('idle')
      const [pluginsError, setPluginsError] = React.useState(null)
      const [features, setFeatures] = React.useState(null)
      const [featuresPhase, setFeaturesPhase] = React.useState('idle')
      const [featuresError, setFeaturesError] = React.useState(null)
      const [logLines, setLogLines] = React.useState([])
      const [logsNote, setLogsNote] = React.useState(null)
      const [logsPhase, setLogsPhase] = React.useState('idle')
      const [logsError, setLogsError] = React.useState(null)
      const [logSource, setLogSource] = React.useState('koishi')
      const [installSpec, setInstallSpec] = React.useState('')
      const [restartAfter, setRestartAfter] = React.useState(false)
      const [busy, setBusy] = React.useState({})
      const [pendingUninstall, setPendingUninstall] = React.useState(null)
      const [accessPhase, setAccessPhase] = React.useState('idle')
      const [accessError, setAccessError] = React.useState(null)
      const [accessWarning, setAccessWarning] = React.useState(null)
      const [accessDraft, setAccessDraft] = React.useState(null)

      const busyOf = (key) => busy[key] === true

      // ------------------------------------------------------------- loading --
      const loadStatus = async () => {
        try {
          const payload = await requestJson('/qqbot/status')
          const data = payload && payload.data
          if (data === null || typeof data !== 'object') throw new Error('unexpected payload')
          setSnapshot(data)
          setLoadError(null)
        } catch (error) {
          setLoadError(messageOf(error))
        } finally {
          setLoading(false)
        }
      }

      const loadPlugins = async () => {
        setPluginsPhase('loading')
        try {
          const payload = await requestJson('/qqbot/koishi/plugins')
          setPlugins(Array.isArray(payload && payload.data) ? payload.data : [])
          setPluginsError(null)
          setPluginsPhase('ready')
        } catch (error) {
          setPluginsError(messageOf(error))
          setPluginsPhase('error')
        }
      }

      const loadFeatures = async () => {
        setFeaturesPhase('loading')
        try {
          const payload = await requestJson('/qqbot/features')
          setFeatures(Array.isArray(payload && payload.data) ? payload.data : [])
          setFeaturesError(null)
          setFeaturesPhase('ready')
        } catch (error) {
          setFeaturesError(messageOf(error))
          setFeaturesPhase('error')
        }
      }

      const loadLogs = async (source) => {
        setLogsPhase('loading')
        try {
          const payload = await requestJson(`/qqbot/logs?source=${encodeURIComponent(source)}&lines=${LOG_LINES}`)
          setLogLines(Array.isArray(payload && payload.lines) ? payload.lines : [])
          setLogsNote(payload && typeof payload.note === 'string' ? payload.note : null)
          setLogsError(null)
          setLogsPhase('ready')
        } catch (error) {
          setLogsError(messageOf(error))
          setLogsPhase('error')
        }
      }

      const loadAccess = async () => {
        setAccessPhase('loading')
        try {
          const payload = await requestJson('/qqbot/access')
          const policy = payload && payload.data
          if (policy === null || typeof policy !== 'object') throw new Error('unexpected payload')
          setAccessDraft(draftFromPolicy(policy))
          setAccessWarning(payload && typeof payload.warning === 'string' ? payload.warning : null)
          setAccessError(null)
          setAccessPhase('ready')
        } catch (error) {
          setAccessError(messageOf(error))
          setAccessPhase('error')
        }
      }

      // Poll the snapshot; the access policy is small, so prefetch it on mount
      // and load the remaining tabs lazily the first time they show.
      React.useEffect(() => {
        let disposed = false
        const tick = () => { if (!disposed) loadStatus() }
        tick()
        loadAccess()
        const timer = setInterval(tick, POLL_MS)
        return () => {
          disposed = true
          clearInterval(timer)
        }
      }, [])

      React.useEffect(() => {
        if (tab === 'access' && accessPhase === 'idle') loadAccess()
        if (tab === 'plugins' && pluginsPhase === 'idle') loadPlugins()
        if (tab === 'features' && featuresPhase === 'idle') loadFeatures()
        if (tab === 'logs' && logsPhase === 'idle') loadLogs(logSource)
      }, [tab, accessPhase, pluginsPhase, featuresPhase, logsPhase])

      // ------------------------------------------------------------ mutation --
      /**
       * Run one JSON POST behind a per-action busy flag. Success and failure
       * both land in the banner; `after` refreshes whatever the action touched.
       */
      const runPost = async (key, path, body, after, successText) => {
        if (busyOf(key)) return
        setBusy((previous) => ({ ...previous, [key]: true }))
        setBanner(null)
        try {
          await requestJson(path, { method: 'POST', body: body || {} })
          setBanner({ kind: 'ok', text: successText || t('actionDone') })
          if (typeof after === 'function') await after()
        } catch (error) {
          setBanner({ kind: 'error', text: `${t('actionFailed')}: ${messageOf(error)}` })
        } finally {
          setBusy((previous) => {
            const next = { ...previous }
            delete next[key]
            return next
          })
        }
      }

      const refreshAfterPluginChange = async () => {
        await loadPlugins()
        await loadStatus()
      }

      const startAll = () => runPost('all-start', '/qqbot/all/start', {}, loadStatus)
      const stopAll = () => runPost('all-stop', '/qqbot/all/stop', {}, loadStatus)
      const installNapcat = () => runPost('napcat-install', '/qqbot/napcat/install', {}, loadStatus)
      const configureNapcat = () => runPost('napcat-configure', '/qqbot/napcat/configure', {}, loadStatus)
      const startNapcat = () => runPost('napcat-start', '/qqbot/napcat/start', {}, loadStatus)
      const stopNapcat = () => runPost('napcat-stop', '/qqbot/napcat/stop', {}, loadStatus)
      const startKoishi = () => runPost('koishi-start', '/qqbot/koishi/start', {}, loadStatus)
      const stopKoishi = () => runPost('koishi-stop', '/qqbot/koishi/stop', {}, loadStatus)
      const restartKoishi = () => runPost('koishi-restart', '/qqbot/koishi/restart', {}, loadStatus)
      const installDeps = () => runPost('koishi-install-deps', '/qqbot/koishi/install-deps', {}, loadStatus)

      const installPlugin = () => {
        const spec = installSpec.trim()
        if (spec === '') return
        runPost('plugin-install', '/qqbot/koishi/plugins/install', { spec, restart: restartAfter }, async () => {
          setInstallSpec('')
          await refreshAfterPluginChange()
        })
      }

      const runFeatureAction = (feature, action) => {
        const key = `feature:${feature.id}:${action.id}`
        runPost(key, '/qqbot/features/run', { feature: feature.id, action: action.id, params: {} }, async () => {
          await loadStatus()
          await loadFeatures()
        })
      }

      const saveAccess = () => {
        if (accessDraft === null) return
        const draft = accessDraft
        // POST the complete policy: the Host normalizes and stamps it, then we
        // re-read so the form shows exactly what was stored.
        const policy = {
          version: 1,
          updatedAt: new Date().toISOString(),
          inbound: {
            groups: { mode: draft.inboundMode, ids: parseIdList(draft.inboundGroups) },
            private: { mode: draft.inboundPrivate ? 'all' : 'whitelist', ids: [] },
            quiet: { enabled: draft.quietEnabled === true, prefixes: parsePrefixes(draft.prefixes) },
          },
          outbound: {
            groups: { mode: draft.outboundMode, ids: parseIdList(draft.outboundGroups) },
            private: { mode: draft.outboundPrivate ? 'all' : 'whitelist', ids: [] },
          },
        }
        runPost('access-save', '/qqbot/access', policy, loadAccess, t('accessSaved'))
      }

      // ------------------------------------------------------------- derived --
      const hasSnapshot = snapshot !== null
      const napcat = (snapshot && snapshot.napcat) || {}
      const koishi = (snapshot && snapshot.koishi) || {}
      const bot = (snapshot && snapshot.bot) || {}
      const qq = (snapshot && snapshot.qq) || {}
      const settings = (snapshot && snapshot.settings) || {}
      const napcatAccounts = Array.isArray(napcat.accounts) ? napcat.accounts : []
      const wsClients = []
      for (const account of napcatAccounts) {
        const clients = account && Array.isArray(account.wsClients) ? account.wsClients : []
        for (const client of clients) {
          wsClients.push(`${client.name || 'ws'} → ${client.url || '—'}${client.enable === false ? ` (${t('stStopped')})` : ''}`)
        }
      }

      const napcatInstalled = napcat.installed === true
      const napcatRunning = napcat.running === true
      const napcatLoggedIn = napcat.loggedIn === true
      const koishiExists = koishi.exists !== false
      const koishiRunning = koishi.running === true
      const botOnline = bot.online === true

      const napcatText = !hasSnapshot ? '—' : !napcatInstalled ? t('stMissing') : napcatRunning ? t('stRunning') : t('stStopped')
      const napcatTone = !hasSnapshot ? 'warn' : !napcatInstalled ? 'bad' : napcatRunning && napcatLoggedIn ? 'ok' : 'warn'
      const koishiText = !hasSnapshot ? '—' : !koishiExists ? t('stMissingProject') : koishiRunning ? t('stRunning') : t('stStopped')
      const koishiTone = !hasSnapshot ? 'warn' : !koishiExists ? 'bad' : koishiRunning ? 'ok' : 'warn'
      const botText = !hasSnapshot ? '—' : botOnline ? t('stOnline') : t('stOffline')
      const botTone = !hasSnapshot ? 'warn' : botOnline ? 'ok' : 'warn'

      // ------------------------------------------------------------ fragments --
      const row = (label, value, tone, mono) => h('div', { key: label, className: 'qqbot-row-item' },
        h('span', { className: 'qqbot-row-label' }, label),
        h('span', { className: `qqbot-row-value${tone ? ` is-${tone}` : ''}${mono ? ' qqbot-mono' : ''}` }, value))

      const pill = (testid, label, text, tone) => h('span', {
        className: `qqbot-pill qqbot-pill-${tone}`,
        'data-testid': testid,
        'aria-label': `${label}: ${text}`,
      },
        h('i', { className: 'qqbot-pill-dot' }),
        h('span', { className: 'qqbot-pill-label' }, label),
        h('span', { className: 'qqbot-pill-text' }, text))

      const actionButton = (id, label, tone, handler, options) => {
        const extra = options || {}
        const key = extra.busyKey || id
        const working = busyOf(key)
        return h('button', {
          key: `action-${id}`,
          type: 'button',
          className: `qqbot-btn${tone ? ` qqbot-btn-${tone}` : ''}`,
          'data-testid': `qqbot-action-${id}`,
          'aria-label': label,
          'aria-busy': working ? 'true' : undefined,
          disabled: extra.disabled === true || working,
          onClick: handler,
        }, working ? t('working') : label)
      }

      const tabItems = [
        { id: 'overview', label: t('tabOverview') },
        { id: 'access', label: t('tabAccess') },
        { id: 'plugins', label: t('tabPlugins') },
        { id: 'features', label: t('tabFeatures') },
        { id: 'logs', label: t('tabLogs') },
      ]

      const tabs = h('div', { className: 'qqbot-tabs', role: 'tablist', 'aria-label': t('title') },
        ...tabItems.map((item) => h('button', {
          key: item.id,
          type: 'button',
          role: 'tab',
          className: `qqbot-tab${tab === item.id ? ' active' : ''}`,
          'data-testid': `qqbot-tab-${item.id}`,
          'aria-label': item.label,
          'aria-selected': tab === item.id ? 'true' : 'false',
          'aria-controls': `qqbot-tabpanel-${item.id}`,
          onClick: () => { setTab(item.id) },
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
              event.preventDefault()
              setTab(item.id)
            }
          },
        }, item.label)))

      const hero = h('header', { className: 'qqbot-hero' },
        h('div', { className: 'qqbot-hero-main' },
          h('span', { className: 'qqbot-eyebrow' }, h('i', { className: 'qqbot-eyebrow-dot' }), t('eyebrow')),
          h('h1', { className: 'qqbot-title' }, t('title')),
          h('p', { className: 'qqbot-sub' }, t('subtitle'))),
        h('div', { className: 'qqbot-hero-side' },
          h('div', { className: 'qqbot-pills' },
            pill('qqbot-pill-napcat', t('pillNapcat'), napcatText, napcatTone),
            pill('qqbot-pill-koishi', t('pillKoishi'), koishiText, koishiTone),
            pill('qqbot-pill-bot', t('pillBot'), botText, botTone)),
          h('div', { className: 'qqbot-btns' },
            h('button', {
              type: 'button',
              className: 'qqbot-btn',
              'data-testid': 'qqbot-status-refresh',
              'aria-label': t('refresh'),
              onClick: () => { loadStatus() },
            }, t('refresh')))))

      const bannerNode = banner === null ? null : h('div', {
        className: `qqbot-banner qqbot-banner-${banner.kind}`,
        role: banner.kind === 'error' ? 'alert' : 'status',
        'data-testid': 'qqbot-banner',
      }, banner.text)

      const pollWarn = loadError !== null && hasSnapshot
        ? h('div', { className: 'qqbot-warn' }, `${t('loadFail')}: ${loadError}`)
        : null

      // ------------------------------------------------------------- overview --
      const renderOverview = () => {
        if (!hasSnapshot) {
          if (loading) return h('div', { className: 'qqbot-empty', role: 'status' }, t('loading'))
          return h('div', { className: 'qqbot-empty', role: 'alert' },
            h('p', { className: 'qqbot-error' }, `${t('loadFail')}: ${loadError || ''}`),
            h('button', {
              type: 'button',
              className: 'qqbot-btn',
              'aria-label': t('retry'),
              onClick: () => { loadStatus() },
            }, t('retry')))
        }

        const webui = napcat.webui || {}
        const napcatRows = [
          row(t('lblInstall'), napcatInstalled ? `${t('stInstalled')}${napcat.version ? ` · v${napcat.version}` : ''}` : t('stMissing'), napcatInstalled ? 'ok' : 'bad'),
          row(t('lblProcess'), napcatRunning ? `${t('stRunning')}${napcat.pid ? ` · PID ${napcat.pid}` : ''}` : t('stStopped'), napcatRunning ? 'ok' : 'warn'),
          row(t('lblLogin'), napcatLoggedIn
            ? `${t('stLoggedIn')}${napcat.qq ? ` · ${napcat.qq}` : ''}${napcat.nickname ? ` (${napcat.nickname})` : ''}`
            : t('stLoggedOut'), napcatLoggedIn ? 'ok' : 'warn'),
          row(t('lblWebui'), `${webui.port || settings.napcatPort || '—'} · ${webui.reachable === true ? t('stReachable') : t('stUnreachable')}`, webui.reachable === true ? 'ok' : 'warn'),
          row(t('lblConfig'), napcat.configApplied === true ? t('stApplied') : t('stNotApplied'), napcat.configApplied === true ? 'ok' : 'warn'),
          row(t('lblAccounts'), String(napcatAccounts.length)),
          row(t('lblWs'), wsClients.length === 0 ? t('noWs') : wsClients.join(' · '), wsClients.length === 0 ? 'warn' : 'ok', true),
        ]
        if (typeof napcat.error === 'string' && napcat.error !== '') napcatRows.push(row(t('lblError'), napcat.error, 'bad'))

        const koishiRows = [
          row(t('lblProject'), koishi.projectDir || settings.projectDir || '—', null, true),
          row(t('lblDeps'), koishi.depsInstalled === true ? t('stInstalled') : t('stMissing'), koishi.depsInstalled === true ? 'ok' : 'warn'),
          row(t('lblProcess'), koishiRunning
            ? `${t('stRunning')}${koishi.managed === true ? ` · ${t('managed')}` : ''}${koishi.pid ? ` · PID ${koishi.pid}` : ''}`
            : t('stStopped'), koishiRunning ? 'ok' : 'warn'),
          row(t('lblPort'), String(koishi.port || settings.koishiPort || '—'), null, true),
          row(t('lblOnline'), botOnline
            ? `${t('stOnline')}${koishi.selfId ? ` · ${koishi.selfId}` : ''}${koishi.platform ? ` · ${koishi.platform}` : ''}`
            : t('stOffline'), botOnline ? 'ok' : 'warn'),
        ]
        if (koishi.stats !== null && typeof koishi.stats === 'object') {
          koishiRows.push(row(t('lblStats'), compactValue(koishi.stats), null, true))
        }
        if (typeof koishi.error === 'string' && koishi.error !== '') koishiRows.push(row(t('lblError'), koishi.error, 'bad'))

        const napcatCard = h('section', { className: 'qqbot-card' },
          h('div', { className: 'qqbot-card-head' },
            h('h2', { className: 'qqbot-card-title' }, t('napcatTitle')),
            h('span', { className: 'qqbot-card-sub' }, `QQ · ${qq.installed === true ? t('stInstalled') : t('stMissing')}`)),
          h('div', { className: 'qqbot-rows' }, ...napcatRows),
          h('div', { className: 'qqbot-actions-row' },
            actionButton('napcat-start', t('napcatStart'), null, startNapcat, { disabled: napcatRunning }),
            actionButton('napcat-stop', t('napcatStop'), 'danger', stopNapcat, { disabled: !napcatRunning })))

        const koishiCard = h('section', { className: 'qqbot-card' },
          h('div', { className: 'qqbot-card-head' },
            h('h2', { className: 'qqbot-card-title' }, t('koishiTitle')),
            h('span', { className: 'qqbot-card-sub' }, `${t('lblPort')} · ${koishi.port || settings.koishiPort || '—'}`)),
          h('div', { className: 'qqbot-rows' }, ...koishiRows),
          h('div', { className: 'qqbot-actions-row' },
            actionButton('koishi-start', t('koishiStart'), null, startKoishi, { disabled: koishiRunning }),
            actionButton('koishi-stop', t('koishiStop'), 'danger', stopKoishi, { disabled: !koishiRunning }),
            actionButton('koishi-restart', t('koishiRestart'), null, restartKoishi)))

        return h('div', { className: 'qqbot-stack' },
          h('div', { className: 'qqbot-grid' }, napcatCard, koishiCard),
          h('section', { className: 'qqbot-card' },
            h('div', { className: 'qqbot-card-head' },
              h('h2', { className: 'qqbot-card-title' }, t('actionsTitle'))),
            h('div', { className: 'qqbot-btns' },
              actionButton('all-start', t('startAll'), 'primary', startAll),
              actionButton('all-stop', t('stopAll'), 'danger', stopAll),
              !napcatInstalled ? actionButton('napcat-install', t('installNapcat'), null, installNapcat) : null,
              actionButton('napcat-configure', t('configureNapcat'), null, configureNapcat),
              koishi.depsInstalled === false ? actionButton('koishi-install-deps', t('installDeps'), null, installDeps) : null),
            !napcatInstalled ? h('p', { className: 'qqbot-hint' }, t('installNapcatHint')) : null))
      }

      // -------------------------------------------------------------- plugins --
      const renderPlugins = () => {
        const items = Array.isArray(plugins) ? plugins : []
        let table = null
        if (items.length > 0) {
          table = h('div', { className: 'qqbot-card', style: { padding: '4px 8px' } },
            h('table', { className: 'qqbot-table' },
              h('thead', null, h('tr', null,
                h('th', null, t('plName')),
                h('th', null, t('plVersion')),
                h('th', null, t('plGroup')),
                h('th', null, t('plEnabled')),
                h('th', null, t('plActions')))),
              h('tbody', null, ...items.map((plugin) => {
                const key = pluginKey(plugin)
                const name = pluginLabel(plugin) || key
                const enabled = plugin.enabled === true
                const toggleKey = `plugin-toggle:${key}`
                const uninstallKey = `plugin-uninstall:${key}`
                const confirming = pendingUninstall === key
                const showPackage = typeof plugin.packageName === 'string' && plugin.packageName !== '' && plugin.packageName !== name
                return h('tr', { key: key, 'data-testid': 'qqbot-plugin-row', 'data-key': key },
                  h('td', null,
                    h('span', { className: 'qqbot-plugin-name' }, name),
                    plugin.local === true ? h('span', { className: 'qqbot-badge' }, t('plLocal')) : null,
                    showPackage ? h('span', { className: 'qqbot-mono qqbot-plugin-package' }, plugin.packageName) : null),
                  h('td', { className: 'qqbot-mono' },
                    typeof plugin.version === 'string' && plugin.version !== '' ? plugin.version : '—'),
                  h('td', { className: 'qqbot-mono' },
                    typeof plugin.group === 'string' && plugin.group !== '' ? plugin.group : '—'),
                  h('td', null, h('button', {
                    type: 'button',
                    className: 'qqbot-switch',
                    role: 'switch',
                    'aria-checked': enabled ? 'true' : 'false',
                    'aria-label': `${name}: ${enabled ? t('plDisable') : t('plEnable')}`,
                    'data-testid': 'qqbot-plugin-toggle',
                    disabled: busyOf(toggleKey),
                    onClick: () => {
                      runPost(toggleKey, '/qqbot/koishi/plugins/toggle', { key, enabled: !enabled, restart: restartAfter }, refreshAfterPluginChange)
                    },
                  }, h('i', { className: 'qqbot-switch-dot' }), enabled ? t('plEnabled') : t('plDisable'))),
                  h('td', null, h('button', {
                    type: 'button',
                    className: `qqbot-btn${confirming ? ' qqbot-btn-danger' : ''}`,
                    'data-testid': 'qqbot-plugin-uninstall',
                    'aria-label': `${name}: ${t('plUninstall')}`,
                    disabled: plugin.removable === false || busyOf(uninstallKey),
                    onClick: () => {
                      if (!confirming) {
                        setPendingUninstall(key)
                        return
                      }
                      setPendingUninstall(null)
                      runPost(uninstallKey, '/qqbot/koishi/plugins/uninstall', { key, restart: restartAfter }, refreshAfterPluginChange)
                    },
                  }, confirming ? t('plConfirm') : t('plUninstall'))))
              }))))
        }

        return h('div', { className: 'qqbot-stack' },
          h('div', { className: 'qqbot-toolbar' },
            h('div', { className: 'qqbot-toolbar-left' },
              h('input', {
                className: 'qqbot-input',
                type: 'text',
                value: installSpec,
                placeholder: t('plInstallPlaceholder'),
                'aria-label': t('plInstallPlaceholder'),
                onChange: (event) => { setInstallSpec(event.currentTarget.value) },
              }),
              h('button', {
                type: 'button',
                className: 'qqbot-btn qqbot-btn-primary',
                'data-testid': 'qqbot-plugin-install',
                'aria-label': t('plInstall'),
                disabled: installSpec.trim() === '' || busyOf('plugin-install'),
                onClick: installPlugin,
              }, busyOf('plugin-install') ? t('plInstalling') : t('plInstall')),
              actionButton('koishi-restart', t('koishiRestart'), null, restartKoishi),
              actionButton('koishi-install-deps', t('installDeps'), null, installDeps)),
            h('div', { className: 'qqbot-toolbar-right' },
              h('label', { className: 'qqbot-check' },
                h('input', {
                  type: 'checkbox',
                  checked: restartAfter,
                  onChange: (event) => { setRestartAfter(event.currentTarget.checked) },
                }),
                t('plRestartAfter')),
              h('button', {
                type: 'button',
                className: 'qqbot-btn',
                'data-testid': 'qqbot-plugins-refresh',
                'aria-label': t('refreshPlugins'),
                disabled: pluginsPhase === 'loading',
                onClick: () => { loadPlugins() },
              }, t('refresh')))),
          h('p', { className: 'qqbot-hint' }, t('plRestartHint')),
          pluginsError !== null
            ? h('div', { className: 'qqbot-banner qqbot-banner-error', role: 'alert' }, `${t('loadPluginsFail')}: ${pluginsError}`)
            : null,
          pluginsPhase === 'loading' && plugins === null
            ? h('div', { className: 'qqbot-empty', role: 'status' }, t('loadingPlugins'))
            : null,
          plugins !== null && items.length === 0 ? h('div', { className: 'qqbot-empty' }, t('pluginsEmpty')) : null,
          table)
      }

      // ------------------------------------------------------------- features --
      const renderFeatures = () => {
        const items = Array.isArray(features) ? features : []
        const cards = items.map((feature) => {
          const title = pickText(feature.title, lang) || feature.id
          const description = pickText(feature.description, lang)
          const statusValue = feature.status !== null && typeof feature.status === 'object' && !Array.isArray(feature.status)
            ? feature.status
            : null
          const statusRows = statusValue === null ? [] : Object.keys(statusValue).map((name) => h('div', {
            key: name,
            className: 'qqbot-row-item',
          },
            h('span', { className: 'qqbot-row-label' }, name),
            h('span', { className: 'qqbot-row-value qqbot-mono' }, compactValue(statusValue[name]))))
          const actions = Array.isArray(feature.actions) ? feature.actions : []
          return h('article', {
            key: feature.id,
            className: 'qqbot-card',
            'data-testid': 'qqbot-feature-card',
            'data-feature': feature.id,
          },
            h('div', { className: 'qqbot-card-head' },
              h('div', { className: 'qqbot-feature-head' },
                h('h2', { className: 'qqbot-card-title' }, title),
                description !== '' ? h('p', { className: 'qqbot-hint' }, description) : null),
              h('span', { className: 'qqbot-badge' }, feature.id)),
            statusRows.length === 0 ? null : h('div', { className: 'qqbot-feature-status' }, ...statusRows),
            typeof feature.error === 'string' && feature.error !== ''
              ? h('p', { className: 'qqbot-error' }, feature.error)
              : null,
            actions.length === 0 ? null : h('div', { className: 'qqbot-actions-row' },
              ...actions.map((action) => {
                const label = pickText(action.title, lang) || action.id
                const tone = action.tone === 'primary' ? 'primary' : action.tone === 'danger' ? 'danger' : null
                const key = `feature:${feature.id}:${action.id}`
                const working = busyOf(key)
                return h('button', {
                  key: action.id,
                  type: 'button',
                  className: `qqbot-btn${tone ? ` qqbot-btn-${tone}` : ''}`,
                  'data-testid': `qqbot-action-${action.id}`,
                  'aria-label': label,
                  'aria-busy': working ? 'true' : undefined,
                  disabled: working,
                  onClick: () => { runFeatureAction(feature, action) },
                }, working ? t('working') : label)
              })))
        })

        return h('div', { className: 'qqbot-stack' },
          h('div', { className: 'qqbot-toolbar' },
            h('div', { className: 'qqbot-toolbar-left' },
              h('span', { className: 'qqbot-card-sub' }, t('featuresTitle'))),
            h('div', { className: 'qqbot-toolbar-right' },
              h('button', {
                type: 'button',
                className: 'qqbot-btn',
                'data-testid': 'qqbot-features-refresh',
                'aria-label': t('featuresRefresh'),
                disabled: featuresPhase === 'loading',
                onClick: () => { loadFeatures() },
              }, t('refresh')))),
          featuresError !== null
            ? h('div', { className: 'qqbot-banner qqbot-banner-error', role: 'alert' }, `${t('loadFeaturesFail')}: ${featuresError}`)
            : null,
          featuresPhase === 'loading' && features === null
            ? h('div', { className: 'qqbot-empty', role: 'status' }, t('loadingFeatures'))
            : null,
          features !== null && items.length === 0 ? h('div', { className: 'qqbot-empty' }, t('featuresEmpty')) : null,
          ...cards,
          h('p', { className: 'qqbot-note' }, t('featuresNote')))
      }

      // --------------------------------------------------------------- access --
      const renderAccess = () => {
        if (accessDraft === null) {
          if (accessPhase === 'loading' || accessPhase === 'idle') {
            return h('div', { className: 'qqbot-empty', role: 'status' }, t('accessLoading'))
          }
          return h('div', { className: 'qqbot-empty', role: 'alert' },
            h('p', { className: 'qqbot-error' }, `${t('accessLoadFail')}: ${accessError || ''}`),
            h('button', {
              type: 'button',
              className: 'qqbot-btn',
              'aria-label': t('retry'),
              onClick: () => { loadAccess() },
            }, t('retry')))
        }

        const draft = accessDraft
        const updateDraft = (patch) => {
          setAccessDraft((previous) => (previous === null ? previous : { ...previous, ...patch }))
        }
        const modeOptions = [
          h('option', { key: 'all', value: 'all' }, t('accessModeAll')),
          h('option', { key: 'whitelist', value: 'whitelist' }, t('accessModeWhitelist')),
          h('option', { key: 'blacklist', value: 'blacklist' }, t('accessModeBlacklist')),
        ]
        const modeId = (scope) => `qqbot-access-${scope}-mode`
        const groupsId = (scope) => `qqbot-access-${scope}-groups`
        const privateId = (scope) => `qqbot-access-private-${scope}`

        const scopeCard = (scope, title, description, mode, groups, privateOn, onMode, onGroups, onPrivate) => h('section', { className: 'qqbot-card' },
          h('div', { className: 'qqbot-card-head' },
            h('h2', { className: 'qqbot-card-title' }, title),
            h('span', { className: 'qqbot-card-sub' }, description)),
          h('div', { className: 'qqbot-form' },
            h('div', { className: 'qqbot-field' },
              h('label', { className: 'qqbot-field-label', htmlFor: modeId(scope) }, t('accessMode')),
              h('select', {
                id: modeId(scope),
                className: 'qqbot-select',
                'data-testid': modeId(scope),
                value: mode,
                onChange: (event) => { onMode(event.currentTarget.value) },
              }, ...modeOptions)),
            h('div', { className: 'qqbot-field' },
              h('label', { className: 'qqbot-field-label', htmlFor: groupsId(scope) }, t('accessGroups')),
              h('textarea', {
                id: groupsId(scope),
                className: 'qqbot-area',
                'data-testid': groupsId(scope),
                rows: 3,
                value: groups,
                placeholder: t('accessGroupsPlaceholder'),
                onChange: (event) => { onGroups(event.currentTarget.value) },
              }),
              h('p', { className: 'qqbot-hint' }, t('accessGroupsModeHint'))),
            h('label', { className: 'qqbot-check qqbot-check-block' },
              h('input', {
                type: 'checkbox',
                'data-testid': privateId(scope),
                checked: privateOn,
                onChange: (event) => { onPrivate(event.currentTarget.checked) },
              }),
              t('accessPrivate')),
            h('p', { className: 'qqbot-hint' }, privateOn ? t('accessPrivateOnHint') : t('accessPrivateOffHint'))))

        const prefixChips = parsePrefixes(draft.prefixes)
        const quietCard = h('section', { className: 'qqbot-card' },
          h('div', { className: 'qqbot-card-head' },
            h('h2', { className: 'qqbot-card-title' }, t('accessQuietTitle'))),
          h('div', { className: 'qqbot-form' },
            h('label', { className: 'qqbot-check qqbot-check-block' },
              h('input', {
                type: 'checkbox',
                'data-testid': 'qqbot-access-quiet',
                checked: draft.quietEnabled,
                onChange: (event) => { updateDraft({ quietEnabled: event.currentTarget.checked }) },
              }),
              t('accessQuiet')),
            h('p', { className: 'qqbot-hint' }, t('accessQuietHint')),
            h('div', { className: 'qqbot-field' },
              h('label', { className: 'qqbot-field-label', htmlFor: 'qqbot-access-prefixes' }, t('accessPrefixes')),
              h('input', {
                id: 'qqbot-access-prefixes',
                className: 'qqbot-input',
                type: 'text',
                'data-testid': 'qqbot-access-prefixes',
                value: draft.prefixes,
                placeholder: t('accessPrefixesPlaceholder'),
                onChange: (event) => { updateDraft({ prefixes: event.currentTarget.value }) },
              }),
              prefixChips.length === 0
                ? h('p', { className: 'qqbot-hint' }, t('accessPrefixesHint'))
                : h('div', { className: 'qqbot-chips' }, ...prefixChips.map((prefix) => h('span', { key: prefix, className: 'qqbot-chip' }, prefix))))))

        return h('div', { className: 'qqbot-stack' },
          h('div', { className: 'qqbot-toolbar' },
            h('div', { className: 'qqbot-toolbar-left' },
              h('h2', { className: 'qqbot-card-title' }, t('accessTitle'))),
            h('div', { className: 'qqbot-toolbar-right' },
              h('button', {
                type: 'button',
                className: 'qqbot-btn',
                'data-testid': 'qqbot-access-refresh',
                'aria-label': t('refresh'),
                disabled: accessPhase === 'loading',
                onClick: () => { loadAccess() },
              }, t('refresh')),
              h('button', {
                type: 'button',
                className: 'qqbot-btn qqbot-btn-primary',
                'data-testid': 'qqbot-access-save',
                'aria-label': t('accessSave'),
                'aria-busy': busyOf('access-save') ? 'true' : undefined,
                disabled: busyOf('access-save') || accessPhase === 'loading',
                onClick: saveAccess,
              }, busyOf('access-save') ? t('working') : t('accessSave')))),
          accessError !== null
            ? h('div', { className: 'qqbot-banner qqbot-banner-error', role: 'alert' }, `${t('accessLoadFail')}: ${accessError}`)
            : null,
          accessWarning !== null ? h('p', { className: 'qqbot-warn' }, accessWarning) : null,
          h('div', { className: 'qqbot-grid' },
            scopeCard('inbound', t('accessInboundTitle'), t('accessInboundDesc'),
              draft.inboundMode, draft.inboundGroups, draft.inboundPrivate,
              (value) => updateDraft({ inboundMode: value }),
              (value) => updateDraft({ inboundGroups: value }),
              (value) => updateDraft({ inboundPrivate: value })),
            scopeCard('outbound', t('accessOutboundTitle'), t('accessOutboundDesc'),
              draft.outboundMode, draft.outboundGroups, draft.outboundPrivate,
              (value) => updateDraft({ outboundMode: value }),
              (value) => updateDraft({ outboundGroups: value }),
              (value) => updateDraft({ outboundPrivate: value }))),
          quietCard,
          h('p', { className: 'qqbot-note' }, t('accessNote')))
      }

      // ----------------------------------------------------------------- logs --
      const renderLogs = () => {
        const sourceButton = (id, label) => h('button', {
          key: id,
          type: 'button',
          className: `qqbot-seg-btn${logSource === id ? ' active' : ''}`,
          'data-testid': `qqbot-logs-source-${id}`,
          'aria-pressed': logSource === id ? 'true' : 'false',
          'aria-label': `${t('logsTitle')}: ${label}`,
          onClick: () => {
            if (logSource === id) return
            setLogSource(id)
            loadLogs(id)
          },
        }, label)

        const body = logsPhase === 'loading' && logLines.length === 0
          ? t('logsLoading')
          : logLines.length === 0 ? t('logsEmpty') : logLines.join('\n')

        return h('div', { className: 'qqbot-stack' },
          h('div', { className: 'qqbot-toolbar' },
            h('div', { className: 'qqbot-toolbar-left' },
              h('div', { className: 'qqbot-seg', role: 'group', 'aria-label': t('logsTitle') },
                sourceButton('koishi', t('logsKoishi')),
                sourceButton('napcat', t('logsNapcat')))),
            h('div', { className: 'qqbot-toolbar-right' },
              h('span', { className: 'qqbot-card-sub' }, String(logLines.length)),
              h('button', {
                type: 'button',
                className: 'qqbot-btn',
                'data-testid': 'qqbot-logs-refresh',
                'aria-label': t('logsRefresh'),
                disabled: logsPhase === 'loading',
                onClick: () => { loadLogs(logSource) },
              }, t('refresh')))),
          logsError !== null
            ? h('div', { className: 'qqbot-banner qqbot-banner-error', role: 'alert' }, `${t('loadLogsFail')}: ${logsError}`)
            : null,
          logsNote !== null ? h('p', { className: 'qqbot-hint' }, logsNote) : null,
          h('pre', { className: 'qqbot-pre', 'data-testid': 'qqbot-logs', 'aria-label': t('logsTitle') }, body))
      }

      const footer = hasSnapshot ? h('footer', { className: 'qqbot-foot' },
        typeof snapshot.updatedAt === 'string'
          ? h('span', null, `${t('updated')} ${formatTime(snapshot.updatedAt)}`)
          : null,
        h('span', null, `Node ${snapshot.platform && snapshot.platform.node ? snapshot.platform.node : '—'}`),
        h('span', null, `${t('lblPort')} · ${settings.koishiPort || '—'}`)) : null

      const body = tab === 'overview'
        ? renderOverview()
        : tab === 'access'
          ? renderAccess()
          : tab === 'plugins'
            ? renderPlugins()
            : tab === 'features'
              ? renderFeatures()
              : renderLogs()

      return h('div', { className: 'qqbot-page', 'data-testid': 'qqbot-panel' },
        hero,
        bannerNode,
        pollWarn,
        tabs,
        h('div', {
          className: 'qqbot-body',
          role: 'tabpanel',
          id: `qqbot-tabpanel-${tab}`,
          'aria-label': t('title'),
        }, body),
        footer)
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-qqbot: dictionaries')
        // One plugin-owned stylesheet: hover, focus and breakpoints are not
        // expressible inline; the tokens keep dark and light themes working.
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.plugin = 'qqbot'
          style.textContent = CSS
          document.head.appendChild(style)
          return () => { style.remove() }
        }, 'dsh-qqbot: stylesheet')
        const t = ctx.locale.bind(NS)
        // The main seat passes no locale binding, so bind it here and hand the
        // translator down; a missing one used to crash the render.
        const ConnectedPanel = (props) => h(Panel, { ...props, t })
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
        }, ConnectedPanel)), 'dsh-qqbot: main panel')
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: SIDEBAR_ID,
          order: 30,
          label: () => t('title'),
        }, QqbotIcon)), 'dsh-qqbot: sidebar row')
      },
    }
  },
})
