import React from 'react'
import { requestJson } from '../../runtime/api.js'

const EMPTY = { character: {}, groups: {}, loops: [], memories: [], listener: null }
const TRIGGER_LABEL = { mention: '@触发', reply: '回复触发', count: '消息数触发', time: '时间触发' }
const STATE_LABELS = ['BUFFER', 'ANALYZE', 'SPEAK', 'SEND', 'STATE_UPDATE']

function obj(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {} }
function arr(value) { return Array.isArray(value) ? value : [] }
function text(value) { return typeof value === 'string' ? value : '' }
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : 0 }
function time(value) {
  if (typeof value !== 'string' || value === '') return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}
function percent(value) { return Math.round(Math.max(0, Math.min(1, num(value))) * 100) }
function ago(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (seconds < 60) return `${seconds} 秒前`
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟前`
  return `${Math.round(seconds / 3600)} 小时前`
}

export function useAi(panel) {
  const [view, setView] = React.useState({ phase: 'loading', data: null, error: null, selected: null, filter: 'all', expanded: null })
  const load = React.useCallback(async (manual = false) => {
    if (manual) setView((prev) => ({ ...prev, phase: prev.data === null ? 'loading' : 'refreshing', error: null }))
    try {
      const payload = await requestJson('/qqbot/group/dashboard')
      const data = obj(payload?.data)
      setView((prev) => ({ ...prev, phase: 'ready', data: { ...EMPTY, ...data }, error: null, selected: prev.selected !== null && obj(data.groups)[prev.selected] !== undefined ? prev.selected : Object.keys(obj(data.groups))[0] ?? null }))
    } catch (error) {
      setView((prev) => ({ ...prev, phase: 'error', error: String(error?.message ?? error) }))
    }
  }, [])
  React.useEffect(() => {
    load()
    const timer = setInterval(() => { void load() }, 5000)
    return () => clearInterval(timer)
  }, [load])
  return () => renderAiTab(panel, {
    ...view,
    refresh: () => { void load(true) },
    selectGroup: (id) => setView((prev) => ({ ...prev, selected: id })),
    setFilter: (filter) => setView((prev) => ({ ...prev, filter })),
    toggleLoop: (id) => setView((prev) => ({ ...prev, expanded: prev.expanded === id ? null : id })),
  })
}

function statusPill(h, label, tone = 'idle') {
  return h('span', { className: `qqbot-ai-pill qqbot-ai-pill-${tone}` }, h('i', { className: 'qqbot-ai-dot' }), label)
}

function metric(h, label, value, hint, tone) {
  return h('div', { className: `qqbot-ai-metric qqbot-ai-metric-${tone || 'blue'}` },
    h('span', { className: 'qqbot-ai-metric-label' }, label),
    h('strong', { className: 'qqbot-ai-metric-value' }, value),
    h('span', { className: 'qqbot-ai-metric-hint' }, hint))
}

function emotionBar(h, label, value, tone) {
  return h('div', { className: 'qqbot-ai-emotion-row' },
    h('div', { className: 'qqbot-ai-emotion-head' }, h('span', null, label), h('span', null, `${percent(value)}%`)),
    h('div', { className: 'qqbot-ai-meter' }, h('i', { className: `qqbot-ai-meter-fill is-${tone}`, style: { width: `${percent(value)}%` } })))
}

function stateMachine(h, active) {
  const index = active?.sendResult?.sent ? 4 : active ? 2 : 0
  return h('div', { className: 'qqbot-ai-machine', 'data-testid': 'qqbot-ai-state-machine' },
    ...STATE_LABELS.map((label, i) => h('div', { key: label, className: `qqbot-ai-machine-node${i <= index ? ' is-reached' : ''}${i === index ? ' is-active' : ''}` },
      h('span', { className: 'qqbot-ai-machine-index' }, String(i + 1).padStart(2, '0')),
      h('span', null, label))),
    h('div', { className: 'qqbot-ai-machine-caption' }, active ? '当前群正在处理 loop' : '空闲 · 等待触发'))
}

function groupRow(h, id, group, selected, select) {
  const queue = obj(group.queue)
  const running = group.running === true
  return h('button', {
    key: id, type: 'button', className: `qqbot-ai-group-row${selected ? ' is-selected' : ''}`,
    'data-testid': 'qqbot-ai-group-row', 'data-group': id, onClick: () => select(id),
  },
  h('div', { className: 'qqbot-ai-group-main' },
    h('div', { className: 'qqbot-ai-group-title' }, h('span', { className: 'qqbot-ai-group-id' }, id),
      running ? statusPill(h, '处理中', 'run') : statusPill(h, '监听中', 'ok')),
    h('div', { className: 'qqbot-ai-group-meta' },
      h('span', null, `缓冲 ${num(group.bufferSize)}`),
      h('span', null, `未处理 ${num(group.unprocessed)}`),
      h('span', null, queue.urgent ? `urgent · ${queue.urgent}` : queue.normal ? `normal · ${queue.normal}` : '队列空'))),
  h('span', { className: 'qqbot-ai-group-arrow' }, '›'))
}

function loopRow(h, loop, expanded, toggle) {
  const sent = loop.sendResult?.sent === true
  const speak = loop.speak?.enabled === true
  return h('div', { key: loop.loopId, className: 'qqbot-ai-loop' },
    h('button', { type: 'button', className: 'qqbot-ai-loop-head', 'data-testid': 'qqbot-ai-loop-row', onClick: () => toggle(loop.loopId) },
      h('span', { className: `qqbot-ai-loop-icon ${sent ? 'is-sent' : 'is-idle'}` }, sent ? '↗' : '·'),
      h('span', { className: 'qqbot-ai-loop-main' },
        h('strong', null, TRIGGER_LABEL[loop.trigger] || loop.trigger || 'loop'),
        h('span', null, `${time(loop.at)} · ${num(loop.materialCount)} 条素材`)),
      h('span', { className: `qqbot-ai-loop-state ${sent ? 'is-sent' : ''}` }, sent ? '已发言' : speak ? '生成中' : '未发言'),
      h('span', { className: 'qqbot-ai-loop-arrow' }, expanded ? '−' : '+')),
    expanded ? h('div', { className: 'qqbot-ai-loop-detail' },
      h('div', { className: 'qqbot-ai-loop-reply' }, loop.reply || '本轮没有发送内容'),
      h('div', { className: 'qqbot-ai-loop-meta' },
        h('span', null, `触发 ${loop.trigger || '—'}`),
        h('span', null, `素材 ${num(loop.materialCount)}`),
        h('span', null, `分析 ${num(loop.analysisMs)} ms`),
        h('span', null, sent ? `发送 ${num(loop.sendResult?.parts)} 条` : '未发送')),
      h('div', { className: 'qqbot-ai-loop-meta' }, h('span', null, loop.loopId || '—'))) : null)
}

export function renderAiTab(panel, view) {
  const { h } = panel
  const data = obj(view.data)
  const character = obj(data.character)
  const core = obj(character.core)
  const emotion = obj(character.emotion)
  const listenerGroups = obj(data.listener?.groups)
  const stateGroups = obj(data.groups)
  const groups = Object.keys({ ...listenerGroups, ...stateGroups }).map((id) => [id, { ...obj(listenerGroups[id]), ...obj(stateGroups[id]) }])
  const loopSource = arr(data.loops).length > 0 ? data.loops : arr(data.listener?.loops)
  const loops = arr(loopSource).filter((loop) => view.filter === 'all' || (view.filter === 'sent' ? loop.sendResult?.sent === true : loop.sendResult?.sent !== true))
  const selectedId = view.selected ?? groups[0]?.[0] ?? null
  const selectedEntry = selectedId === null ? null : groups.find(([id]) => id === selectedId)
  const selectedGroup = selectedEntry === undefined || selectedEntry === null ? null : selectedEntry[1]
  const activeLoop = selectedGroup?.lastLoop ?? null
  const queueCount = groups.reduce((sum, [, g]) => sum + (obj(g.queue).urgent ? 1 : 0) + (obj(g.queue).normal ? 1 : 0), 0)
  const activeCount = groups.filter(([, g]) => g.running === true).length
  const sentCount = arr(data.loops).filter((loop) => loop.sendResult?.sent === true).length
  const loading = view.phase === 'loading'
  if (loading) {
    return h('div', { className: 'qqbot-ai-dashboard', 'data-testid': 'qqbot-ai-dashboard' }, h('div', { className: 'qqbot-ai-skeleton' }, '正在连接群聊监听器…'))
  }
  if (view.phase === 'error') {
    return h('div', { className: 'qqbot-ai-dashboard', 'data-testid': 'qqbot-ai-dashboard' },
      h('section', { className: 'qqbot-ai-card qqbot-ai-error-card' },
        h('span', { className: 'qqbot-ai-eyebrow' }, 'LISTENER OFFLINE'),
        h('h2', null, '监听器暂时不可用'),
        h('p', { 'data-testid': 'qqbot-ai-error' }, view.error || '无法读取运行数据'),
        h('button', { type: 'button', className: 'qqbot-ai-btn qqbot-ai-btn-primary', 'data-testid': 'qqbot-ai-refresh', onClick: view.refresh }, '重新连接')))
  }
  return h('div', { className: 'qqbot-ai-dashboard', 'data-testid': 'qqbot-ai-dashboard' },
    h('header', { className: 'qqbot-ai-hero' },
      h('div', null,
        h('span', { className: 'qqbot-ai-eyebrow' }, 'GROUP LISTENER / LIVE CONTROL'),
        h('h1', null, '群聊 AI 运行台'),
        h('p', null, '监听群消息，按队列触发分析、发言与状态更新。')),
      h('div', { className: 'qqbot-ai-hero-actions' },
        statusPill(h, activeCount > 0 ? `${activeCount} 个群处理中` : '监听中', activeCount > 0 ? 'run' : 'ok'),
        h('button', { type: 'button', className: 'qqbot-ai-btn qqbot-ai-btn-primary', 'data-testid': 'qqbot-ai-refresh', onClick: view.refresh, 'aria-busy': view.phase === 'refreshing' ? 'true' : undefined }, view.phase === 'refreshing' ? '刷新中…' : '刷新数据'))),
    h('div', { className: 'qqbot-ai-metrics', 'data-testid': 'qqbot-ai-metrics' },
      metric(h, '活跃群', groups.length, '最近有消息的群', 'blue'),
      metric(h, '待处理', queueCount, 'urgent + normal', queueCount > 0 ? 'amber' : 'slate'),
      metric(h, '已发言', sentCount, '最近 30 个 loop', 'green'),
      metric(h, '情绪电量', `${percent(emotion.socialBattery)}%`, '角色当前社交电量', 'violet')),
    h('div', { className: 'qqbot-ai-main-grid' },
      h('section', { className: 'qqbot-ai-card qqbot-ai-flow-card' },
        h('div', { className: 'qqbot-ai-card-head' },
          h('div', null, h('span', { className: 'qqbot-ai-card-kicker' }, 'PIPELINE'),
            h('h2', null, '状态流转')),
          h('span', { className: 'qqbot-ai-card-sub' }, selectedId ?? '暂无群')),
        stateMachine(h, activeLoop),
        selectedGroup !== null ? h('div', { className: 'qqbot-ai-active-group' },
          h('div', { className: 'qqbot-ai-active-title' }, h('strong', null, selectedId), h('span', null, `缓冲 ${num(selectedGroup.bufferSize)} · 未处理 ${num(selectedGroup.unprocessed)}`)),
          h('div', { className: 'qqbot-ai-active-queue' },
            h('span', null, `urgent ${obj(selectedGroup.queue).urgent ? '有请求' : '空'}`),
            h('span', null, `normal ${obj(selectedGroup.queue).normal ? '有请求' : '空'}`),
            h('span', null, selectedGroup.running ? 'worker 运行中' : 'worker 空闲'))) : h('p', { className: 'qqbot-ai-empty-line' }, '还没有群聊监听数据。')),
      h('section', { className: 'qqbot-ai-card qqbot-ai-character', 'data-testid': 'qqbot-ai-character' },
        h('div', { className: 'qqbot-ai-card-head' },
          h('div', null, h('span', { className: 'qqbot-ai-card-kicker' }, 'CHARACTER'),
            h('h2', null, text(core.name) || '角色')),
          statusPill(h, '状态投影', 'violet')),
        h('p', { className: 'qqbot-ai-identity' }, text(core.identity) || '尚未建立角色核心'),
        h('div', { className: 'qqbot-ai-emotions', 'data-testid': 'qqbot-ai-emotion' },
          emotionBar(h, '心情', (num(emotion.valence) + 1) / 2, 'rose'),
          emotionBar(h, '精力', emotion.energy, 'blue'),
          emotionBar(h, '社交电量', emotion.socialBattery, 'violet'),
          emotionBar(h, '压力', emotion.stress, 'amber')),
        h('p', { className: 'qqbot-ai-voice' }, `语气：${text(core.voice) || '—'}`))),
    h('div', { className: 'qqbot-ai-lower-grid' },
      h('section', { className: 'qqbot-ai-card' },
        h('div', { className: 'qqbot-ai-card-head' },
          h('div', null, h('span', { className: 'qqbot-ai-card-kicker' }, 'GROUPS'), h('h2', null, '群队列')),
          h('span', { className: 'qqbot-ai-card-sub' }, `${groups.length} 个群`)),
        h('div', { className: 'qqbot-ai-groups', 'data-testid': 'qqbot-ai-groups' },
          groups.length === 0 ? h('p', { className: 'qqbot-ai-empty-line' }, '还没有监听到群消息') : groups.map(([id, group]) => groupRow(h, id, group, id === selectedId, view.selectGroup)))),
      h('section', { className: 'qqbot-ai-card' },
        h('div', { className: 'qqbot-ai-card-head' },
          h('div', null, h('span', { className: 'qqbot-ai-card-kicker' }, 'RECENT LOOPS'), h('h2', null, '最近闭环')),
          h('div', { className: 'qqbot-ai-tabs' },
            ...['all', 'sent', 'silent'].map((filter) => h('button', { key: filter, type: 'button', className: `qqbot-ai-tab${view.filter === filter ? ' is-active' : ''}`, 'data-testid': `qqbot-ai-loop-filter-${filter}`, onClick: () => view.setFilter(filter) }, filter === 'all' ? '全部' : filter === 'sent' ? '已发言' : '未发言')))),
        h('div', { className: 'qqbot-ai-loops', 'data-testid': 'qqbot-ai-loops' },
          loops.length === 0 ? h('p', { className: 'qqbot-ai-empty-line' }, '还没有分析记录') : loops.slice(0, 12).map((loop) => loopRow(h, loop, view.expanded === loop.loopId, view.toggleLoop))))),
    h('section', { className: 'qqbot-ai-card qqbot-ai-memory-card' },
      h('div', { className: 'qqbot-ai-card-head' },
        h('div', null, h('span', { className: 'qqbot-ai-card-kicker' }, 'MEMORY'), h('h2', null, '最近记忆')),
        h('span', { className: 'qqbot-ai-card-sub' }, `${arr(data.memories).length} 条`)),
      h('div', { className: 'qqbot-ai-memories', 'data-testid': 'qqbot-ai-memories' },
        arr(data.memories).length === 0 ? h('p', { className: 'qqbot-ai-empty-line' }, '每次分析后这里会出现状态更新记录') : arr(data.memories).slice(-8).reverse().map((memory) => h('div', { key: memory.id || memory.summary, className: 'qqbot-ai-memory' },
          h('span', { className: `qqbot-ai-memory-dot is-${memory.importance || 'medium'}` }),
          h('div', null, h('p', null, text(memory.summary) || '—'), h('span', null, `${time(memory.at)} · ${text(memory.kind) || 'event'}`)))))),
    h('footer', { className: 'qqbot-ai-footer' },
      h('span', null, `监听器 ${data.listener?.updatedAt ? `更新于 ${time(data.listener.updatedAt)}` : '等待数据'}`),
      h('span', null, '群间并发 · 群内串行 · 每轮 state_update 一次')))
}
