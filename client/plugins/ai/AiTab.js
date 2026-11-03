import React from 'react'
import { requestJson } from '../../runtime/api.js'

const EMPTY = { character: {}, groups: {}, loops: [], memories: [], listener: null }
const TRIGGER_LABEL = { mention: '@触发', reply: '回复触发', count: '消息数触发', time: '时间触发', keyword: '兴趣关键词' }
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

function profilesBlock(h, selectedId, profiles) {
  return h('div', { className: 'qqbot-ai-profile-block', 'data-testid': 'qqbot-ai-profiles' },
    h('div', { className: 'qqbot-ai-profile-head' }, h('span', null, '成员画像'), h('span', null, selectedId === null ? '选择群查看' : selectedId)),
    selectedId === null
      ? h('p', { className: 'qqbot-ai-empty-line' }, '进入群详情后显示成员画像')
      : profiles.length === 0
        ? h('p', { className: 'qqbot-ai-empty-line' }, '这个群还没有成员画像')
        : profiles.map((profile) => h('div', { key: `${profile.groupId}:${profile.qq}`, className: 'qqbot-ai-profile' },
          h('div', { className: 'qqbot-ai-profile-name' }, h('strong', null, text(profile.nickname) || text(profile.qq)), h('span', null, text(profile.qq))),
          h('p', null, text(profile.summary) || text(profile.personality) || text(profile.recent) || '暂无概要'),
          arr(profile.interests).length > 0 ? h('div', { className: 'qqbot-ai-profile-tags' }, ...arr(profile.interests).slice(0, 4).map((tag) => h('span', { key: tag }, tag))) : null)))
}

export function useAi(panel) {
  const [view, setView] = React.useState({ phase: 'loading', data: null, error: null, selected: null, overview: false, filter: 'all', expanded: null, settings: false })
  const selectedRef = React.useRef(null)
  const load = React.useCallback(async (manual = false, groupId = selectedRef.current) => {
    if (manual) setView((prev) => ({ ...prev, phase: prev.data === null ? 'loading' : 'refreshing', error: null }))
    try {
      const query = groupId === null ? '' : `?groupId=${encodeURIComponent(groupId)}`
      const payload = await requestJson(`/qqbot/group/dashboard${query}`)
      const data = obj(payload?.data)
      const ids = [...new Set([...Object.keys(obj(data.listener?.groups)), ...Object.keys(obj(data.groups))])]
      setView((prev) => {
        let selected = prev.overview ? null : prev.selected
        if (selected === null && prev.overview !== true) selected = ids[0] ?? null
        if (selected !== null && !ids.includes(selected)) selected = ids[0] ?? null
        return { ...prev, phase: 'ready', data: { ...EMPTY, ...data }, error: null, selected }
      })
    } catch (error) {
      setView((prev) => ({ ...prev, phase: 'error', error: String(error?.message ?? error) }))
    }
  }, [])
  React.useEffect(() => {
    if (panel.tab !== 'ai') return undefined
    void load()
    const timer = setInterval(() => { void load(false, selectedRef.current) }, 5000)
    return () => clearInterval(timer)
  }, [panel.tab, load])
  React.useEffect(() => {
    if (view.overview === true || view.selected === null) return
    selectedRef.current = view.selected
    void load(false, view.selected)
  }, [view.selected, view.overview, load])
  return () => renderAiTab(panel, {
    ...view,
    refresh: () => { void load(true, selectedRef.current) },
    selectGroup: (id) => {
      selectedRef.current = id ?? null
      setView((prev) => ({ ...prev, selected: id ?? null, overview: id === null }))
      void load(false, id ?? null)
    },
    setFilter: (filter) => setView((prev) => ({ ...prev, filter })),
    toggleLoop: (id) => setView((prev) => ({ ...prev, expanded: prev.expanded === id ? null : id })),
    openSettings: () => setView((prev) => ({ ...prev, settings: true })),
    closeSettings: () => setView((prev) => ({ ...prev, settings: false })),
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

const PHASE_INDEX = { buffer: 0, analyze: 1, compose: 2, send: 3, state_update: 4 }
const PHASE_LABEL = { buffer: '缓冲区', analyze: '分析', compose: '生成发言', send: '发送', state_update: '更新状态' }

function stateMachine(h, group) {
  const active = group !== null && group !== undefined && typeof group === 'object' && (group.active !== null && group.active !== undefined || group.running === true)
  const currentPhase = active ? text(group?.phase) : ''
  const lastPhase = !active ? text(group?.lastPhase) : ''
  const phase = active ? currentPhase : lastPhase
  const index = active ? (PHASE_INDEX[currentPhase] ?? 1) : (PHASE_INDEX[lastPhase] ?? 0)
  const caption = active
    ? `处理中 · ${PHASE_LABEL[currentPhase] ?? '准备'}`
    : lastPhase !== ''
      ? `上一轮完成 · ${PHASE_LABEL[lastPhase] ?? lastPhase}`
      : '空闲 · 等待触发'
  return h('div', { className: 'qqbot-ai-machine', 'data-testid': 'qqbot-ai-state-machine' },
    ...STATE_LABELS.map((label, i) => h('div', { key: label, className: `qqbot-ai-machine-node${i <= index ? ' is-reached' : ''}${active && i === index ? ' is-active' : ''}` },
      h('span', { className: 'qqbot-ai-machine-index' }, String(i + 1).padStart(2, '0')),
      h('span', null, label))),
    h('div', { className: 'qqbot-ai-machine-caption' }, caption))
}

function groupRow(h, id, group, selected, select) {
  const queue = obj(group.queue)
  const running = group.running === true
  const threshold = num(group.countThreshold)
  const unprocessed = num(group.unprocessed)
  const remaining = Math.max(0, threshold - unprocessed)
  return h('button', {
    key: id, type: 'button', className: `qqbot-ai-group-row${selected ? ' is-selected' : ''}`,
    'data-testid': 'qqbot-ai-group-row', 'data-group': id, onClick: () => select(id),
  },
  h('div', { className: 'qqbot-ai-group-main' },
    h('div', { className: 'qqbot-ai-group-title' },
      h('div', { className: 'qqbot-ai-group-name-wrap' },
        h('span', { className: 'qqbot-ai-group-name' }, text(group.name) || id),
        text(group.name) ? h('span', { className: 'qqbot-ai-group-id' }, id) : null),
      running ? statusPill(h, '处理中', 'run') : statusPill(h, '监听中', 'ok')),
    h('div', { className: 'qqbot-ai-group-meta' },
      h('span', null, `缓冲 ${num(group.bufferSize)}`),
      h('span', null, `未处理 ${unprocessed}`),
      h('span', { className: 'qqbot-ai-next-trigger' }, threshold > 0 ? `下次触发 ${threshold} 条 · 还差 ${remaining} 条` : '下次触发阈值未知'),
      h('span', null, queue.urgent ? `urgent · ${queue.urgent}` : queue.normal ? `normal · ${queue.normal}` : '队列空'))),
  h('span', { className: 'qqbot-ai-group-arrow' }, '›'))
}

function loopRow(h, loop, expanded, toggle) {
  const sent = loop.sendResult?.sent === true
  const failed = sent !== true && (typeof loop.sendResult?.error === 'string' || loop.sendResult?.reason === 'compose_failed' || loop.sendResult?.reason === 'loop_failed')
  const speak = loop.speak?.enabled === true
  const action = loop.sendResult?.replyType === 'action'
  return h('div', { key: loop.loopId, className: 'qqbot-ai-loop' },
    h('button', { type: 'button', className: 'qqbot-ai-loop-head', 'data-testid': 'qqbot-ai-loop-row', onClick: () => toggle(loop.loopId) },
      h('span', { className: `qqbot-ai-loop-icon ${sent ? 'is-sent' : 'is-idle'}` }, action ? '·' : sent ? '↗' : '·'),
      h('span', { className: 'qqbot-ai-loop-main' },
        h('strong', null, TRIGGER_LABEL[loop.trigger] || loop.trigger || 'loop'),
        h('span', null, `${time(loop.at)} · ${num(loop.materialCount)} 条素材`)),
      h('span', { className: `qqbot-ai-loop-state ${sent ? 'is-sent' : ''}` }, action ? '已戳一戳' : sent ? '已发言' : failed ? '发送失败' : speak ? '未发送' : '未发言'),
      h('span', { className: 'qqbot-ai-loop-arrow' }, expanded ? '−' : '+')),
    expanded ? h('div', { className: 'qqbot-ai-loop-detail' },
      h('div', { className: 'qqbot-ai-loop-reply' }, loop.reply || '本轮没有发送内容'),
      h('div', { className: 'qqbot-ai-loop-meta' },
        h('span', null, `触发 ${loop.trigger || '—'}`),
        h('span', null, `素材 ${num(loop.materialCount)}`),
        h('span', null, `耗时 ${num(loop.durationMs)} ms`),
        h('span', null, action ? '戳一戳' : sent ? `发送 ${num(loop.sendResult?.parts)} 条` : '未发送')),
      h('div', { className: 'qqbot-ai-loop-meta' }, h('span', null, loop.loopId || '—'))) : null)
}

function infoField(h, label, value, extra = '') {
  return h('div', { className: `qqbot-ai-info ${extra}` },
    h('span', { className: 'qqbot-ai-info-label' }, label),
    h('p', { className: 'qqbot-ai-info-value' }, text(value) || '—'))
}

function exampleBlock(h, example, index) {
  return h('div', { key: `example-${index}`, className: 'qqbot-ai-example' },
    h('div', { className: 'qqbot-ai-example-line' }, h('span', null, '用户'), h('p', null, text(example.user) || '—')),
    h('div', { className: 'qqbot-ai-example-line is-assistant' }, h('span', null, '角色'), h('p', null, text(example.assistant) || '—')))
}

function settingsCardHead(h, kicker, title, sub) {
  return h('div', { className: 'qqbot-ai-card-head' },
    h('div', null, h('span', { className: 'qqbot-ai-card-kicker' }, kicker), h('h2', null, title)),
    sub ? h('span', { className: 'qqbot-ai-card-sub' }, sub) : null)
}

function profileDetail(h, profile) {
  return h('div', { key: `${profile.groupId}:${profile.qq}`, className: 'qqbot-ai-profile qqbot-ai-profile-full' },
    h('div', { className: 'qqbot-ai-profile-name' }, h('strong', null, text(profile.nickname) || text(profile.qq)), h('span', null, text(profile.qq))),
    h('div', { className: 'qqbot-ai-profile-facts' },
      text(profile.personality) ? h('span', null, `性格 ${text(profile.personality)}`) : null,
      text(profile.style) ? h('span', null, `风格 ${text(profile.style)}`) : null,
      text(profile.relationship) ? h('span', null, `关系 ${text(profile.relationship)}`) : null),
    h('p', null, text(profile.summary) || text(profile.recent) || '暂无概要'),
    arr(profile.interests).length > 0
      ? h('div', { className: 'qqbot-ai-profile-tags' }, ...arr(profile.interests).slice(0, 6).map((tag) => h('span', { key: tag }, tag)))
      : null)
}

function groupDetail(h, id, group) {
  return h('div', { key: id, className: 'qqbot-ai-settings-group' },
    h('div', { className: 'qqbot-ai-settings-group-head' }, h('strong', null, text(group.name) || id), h('span', null, id)),
    h('p', null, text(group.topic) || '暂无最近话题'),
    h('div', { className: 'qqbot-ai-profile-tags' },
      h('span', null, `${arr(group.participants).length} 位参与者`),
      h('span', null, group.running ? '处理中' : '监听中'),
      group.lastPhase ? h('span', null, `上一阶段 ${PHASE_LABEL[group.lastPhase] || group.lastPhase}`) : null))
}

function renderAiSettings(panel, view) {
  const { h } = panel
  const data = obj(view.data)
  const character = obj(data.character)
  const core = obj(character.core)
  const emotion = obj(character.emotion)
  const persona = obj(data.persona)
  const groupsState = obj(data.groups)
  const listenerGroups = obj(data.listener?.groups)
  const groups = Object.keys({ ...listenerGroups, ...groupsState }).map((id) => [id, { ...obj(listenerGroups[id]), ...obj(groupsState[id]) }])
  const selectedId = view.selected ?? groups[0]?.[0] ?? null
  const profiles = arr(data.profiles).filter((profile) => selectedId === null || String(profile.groupId) === String(selectedId))
  const memories = arr(data.memories).slice(-12).reverse()
  const name = text(persona.name) || text(core.name) || '未命名角色'
  const role = text(persona.role) || text(core.identity)
  const tone = text(persona.tone) || text(core.voice)
  const personality = text(persona.personality)
  const rules = text(persona.rules)
  const keywords = arr(persona.keywords).length > 0 ? arr(persona.keywords) : arr(core.keywords)
  const examples = arr(persona.examples)
  const updatedAt = persona.updatedAt || character.updatedAt || data.updatedAt
  const selectedGroup = groups.find(([id]) => id === selectedId)
  const selectedName = selectedGroup === undefined ? (selectedId || '未选择群') : (text(selectedGroup[1].name) || selectedId)
  const personaCard = h('section', { className: 'qqbot-ai-card qqbot-ai-persona-panel', 'data-testid': 'qqbot-ai-persona' },
    settingsCardHead(h, 'PERSONA', '完整人格设定', 'persona.json'),
    h('div', { className: 'qqbot-ai-info-grid' },
      infoField(h, '名称', name),
      infoField(h, '语气', tone),
      infoField(h, '性格', personality, 'is-wide'),
      infoField(h, '身份', role, 'is-full')),
    h('div', { className: 'qqbot-ai-rule-block', 'data-testid': 'qqbot-ai-persona-rules' },
      h('span', null, '行为准则'),
      h('p', null, rules || '暂无行为准则')),
    keywords.length > 0 ? h('div', { className: 'qqbot-ai-settings-keywords' },
      h('div', { className: 'qqbot-ai-profile-head' }, h('span', null, '兴趣关键词'), h('span', null, '触发用 · 不进入提示词')),
      h('div', { className: 'qqbot-ai-keyword-tags' }, ...keywords.map((keyword) => h('span', { key: keyword }, keyword)))) : null,
    examples.length > 0 ? h('div', { className: 'qqbot-ai-examples', 'data-testid': 'qqbot-ai-persona-examples' },
      h('div', { className: 'qqbot-ai-profile-head' }, h('span', null, '对话示例'), h('span', null, '仅展示 · 不进入提示词')),
      ...examples.slice(0, 6).map((example, index) => exampleBlock(h, example, index))) : null)
  const emotionCard = h('section', { className: 'qqbot-ai-card' },
    settingsCardHead(h, 'EMOTION', '当前状态', '软约束'),
    h('div', { className: 'qqbot-ai-emotions' },
      emotionBar(h, '心情', (num(emotion.valence) + 1) / 2, 'rose'),
      emotionBar(h, '唤醒度', emotion.arousal, 'amber'),
      emotionBar(h, '精力', emotion.energy, 'blue'),
      emotionBar(h, '社交电量', emotion.socialBattery, 'violet'),
      emotionBar(h, '压力', emotion.stress, 'amber')),
    h('div', { className: 'qqbot-ai-emotion-numbers', 'data-testid': 'qqbot-ai-emotion-numbers' },
      ...['valence', 'arousal', 'energy', 'socialBattery', 'stress'].map((key) => h('span', { key }, `${key} ${num(emotion[key]).toFixed(2)}`))))
  const profilesCard = h('section', { className: 'qqbot-ai-card', 'data-testid': 'qqbot-ai-settings-profiles' },
    settingsCardHead(h, 'PROFILES', `用户画像 · ${selectedName}`, `${profiles.length} 人`),
    profiles.length === 0
      ? h('p', { className: 'qqbot-ai-empty-line' }, selectedId === null ? '进入群详情后显示画像' : '这个群还没有用户画像')
      : h('div', { className: 'qqbot-ai-settings-profiles' }, ...profiles.slice(0, 8).map((profile) => profileDetail(h, profile))))
  const memoryCard = h('section', { className: 'qqbot-ai-card' },
    settingsCardHead(h, 'MEMORY', '记忆库', `${memories.length} 条最近记忆`),
    h('div', { className: 'qqbot-ai-settings-memories', 'data-testid': 'qqbot-ai-settings-memories' },
      memories.length === 0 ? h('p', { className: 'qqbot-ai-empty-line' }, '还没有长期记忆') : memories.map((memory) => h('div', { key: memory.id || memory.summary, className: 'qqbot-ai-memory' },
        h('span', { className: `qqbot-ai-memory-dot is-${memory.importance || 'medium'}` }),
        h('div', null, h('p', null, text(memory.summary) || '—'), h('span', null, `${time(memory.at)} · ${text(memory.kind) || 'event'}`))))))
  const groupsCard = h('section', { className: 'qqbot-ai-card' },
    settingsCardHead(h, 'GROUPS', '群聊状态', `${groups.length} 个群`),
    h('div', { className: 'qqbot-ai-settings-groups', 'data-testid': 'qqbot-ai-settings-groups' },
      groups.length === 0 ? h('p', { className: 'qqbot-ai-empty-line' }, '还没有群聊状态') : groups.map(([id, group]) => groupDetail(h, id, group))))
  return h('div', { className: 'qqbot-ai-dashboard qqbot-ai-settings', 'data-testid': 'qqbot-ai-settings' },
    h('header', { className: 'qqbot-ai-settings-hero' },
      h('button', { type: 'button', className: 'qqbot-ai-btn qqbot-ai-btn-back', 'data-testid': 'qqbot-ai-settings-back', onClick: view.closeSettings }, '← 返回运行台'),
      h('div', { className: 'qqbot-ai-settings-hero-copy' },
        h('span', { className: 'qqbot-ai-eyebrow' }, 'CHARACTER / SETTINGS'),
        h('h1', null, name),
        h('p', null, role || '还没有角色身份')),
      h('div', { className: 'qqbot-ai-settings-hero-meta' },
        statusPill(h, '状态投影', 'violet'),
        h('span', null, updatedAt ? `更新于 ${time(updatedAt)}` : '等待状态数据'))),
    h('div', { className: 'qqbot-ai-settings-grid' }, personaCard, h('aside', { className: 'qqbot-ai-settings-side' }, emotionCard, profilesCard)),
    h('div', { className: 'qqbot-ai-settings-bottom' }, memoryCard, groupsCard))
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
  const selectedId = view.overview === true ? null : (view.selected ?? groups[0]?.[0] ?? null)
  const selectedProfiles = selectedId === null ? [] : arr(data.profiles).filter((profile) => String(profile.groupId) === String(selectedId)).slice(0, 4)
  const selectedEntry = selectedId === null ? null : groups.find(([id]) => id === selectedId)
  const selectedGroup = selectedEntry === undefined || selectedEntry === null ? null : selectedEntry[1]
  const queueCount = groups.reduce((sum, [, g]) => sum + (obj(g.queue).urgent ? 1 : 0) + (obj(g.queue).normal ? 1 : 0), 0)
  const activeCount = groups.filter(([, g]) => g.running === true).length
  const sentCount = arr(loopSource).filter((loop) => loop.sendResult?.sent === true).length
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
  if (view.settings === true) return renderAiSettings(panel, view)
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
          h('div', { className: 'qqbot-ai-card-actions' },
            selectedId === null ? null : h('button', { type: 'button', className: 'qqbot-ai-btn qqbot-ai-btn-back', 'data-testid': 'qqbot-ai-back-overview', onClick: () => view.selectGroup(null) }, '← 返回总览'),
            h('span', { className: 'qqbot-ai-card-sub' }, selectedId ?? '总览'))),
        stateMachine(h, selectedGroup),
        selectedGroup !== null ? h('div', { className: 'qqbot-ai-active-group' },
          h('div', { className: 'qqbot-ai-active-title' }, h('strong', null, text(selectedGroup.name) || selectedId), h('span', null, `${selectedId} · 缓冲 ${num(selectedGroup.bufferSize)}`)),
          h('div', { className: 'qqbot-ai-active-queue' },
            h('span', null, `urgent ${obj(selectedGroup.queue).urgent ? '有请求' : '空'}`),
            h('span', null, `normal ${obj(selectedGroup.queue).normal ? '有请求' : '空'}`),
            h('span', null, selectedGroup.running ? 'worker 运行中' : 'worker 空闲')),
          h('div', { className: 'qqbot-ai-next-trigger qqbot-ai-next-trigger-detail' },
            h('span', null, `下次计数触发：${num(selectedGroup.countThreshold) || '?'} 条`),
            h('span', null, `当前已积累 ${num(selectedGroup.unprocessed)} 条 · 还差 ${Math.max(0, num(selectedGroup.countThreshold) - num(selectedGroup.unprocessed))} 条`))) : h('p', { className: 'qqbot-ai-empty-line' }, groups.length === 0 ? '还没有群聊监听数据。' : '总览模式：点击左侧群队列中的群查看监听状态。')),
      h('section', {
        className: 'qqbot-ai-card qqbot-ai-character qqbot-ai-character-clickable',
        'data-testid': 'qqbot-ai-character',
        role: 'button',
        tabIndex: 0,
        onClick: view.openSettings,
        onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') view.openSettings() },
      },
        h('div', { className: 'qqbot-ai-card-head' },
          h('div', null, h('span', { className: 'qqbot-ai-card-kicker' }, 'CHARACTER'),
            h('h2', null, text(core.name) || '角色')),
          h('div', { className: 'qqbot-ai-card-actions' },
            statusPill(h, '状态投影', 'violet'),
            h('button', { type: 'button', className: 'qqbot-ai-card-link', 'data-testid': 'qqbot-ai-open-settings', onClick: (event) => { if (event && typeof event.stopPropagation === 'function') event.stopPropagation(); view.openSettings() } }, '进入设定 →'))),
        h('p', { className: 'qqbot-ai-identity' }, text(core.identity) || '尚未建立角色核心'),
        h('div', { className: 'qqbot-ai-emotions', 'data-testid': 'qqbot-ai-emotion' },
          emotionBar(h, '心情', (num(emotion.valence) + 1) / 2, 'rose'),
          emotionBar(h, '精力', emotion.energy, 'blue'),
          emotionBar(h, '社交电量', emotion.socialBattery, 'violet'),
          emotionBar(h, '压力', emotion.stress, 'amber')),
        h('p', { className: 'qqbot-ai-voice' }, `语气：${text(core.voice) || '—'}`),
        h('div', { className: 'qqbot-ai-keywords', 'data-testid': 'qqbot-ai-keywords' },
          h('div', { className: 'qqbot-ai-profile-head' }, h('span', null, '兴趣关键词'), h('span', null, `${arr(core.keywords).length} 个`)),
          arr(core.keywords).length === 0
            ? h('p', { className: 'qqbot-ai-empty-line' }, '人设暂无关键词')
            : h('div', { className: 'qqbot-ai-keyword-tags' }, ...arr(core.keywords).map((keyword) => h('span', { key: keyword }, keyword)))),
        profilesBlock(h, selectedId, selectedProfiles))),
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
