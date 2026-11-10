/** Durable state for the group-listener loop: character, groups, memory. */
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureProfile, loadProfileStore, mergeProfile, saveProfileStore } from '../profiles/index.js'
import { readJsonFile, SerialQueue, writeJsonAtomic, writeTextAtomic } from './atomic.js'

const DEFAULTS = () => ({
  emotion: { valence: 0.08, arousal: 0.4, energy: 0.62, socialBattery: 0.55, stress: 0.16 },
  core: { name: '群友', identity: '群里的普通群友', voice: '简洁自然，不用客服腔' },
})

const PROCESSED_LIMIT = 500
const MEMORY_LIMIT = 50
const MESSAGE_LIMIT = 5000
const MEMORY_WRITE_LIMIT = 20
const EMOTION_BASELINE = Object.freeze({ valence: 0.08, arousal: 0.4, energy: 0.62, socialBattery: 0.55, stress: 0.16 })
const EMOTION_DELTA_LIMIT = 0.03
const ENERGY_RECOVERY_MINUTES = 90
const SOCIAL_RECOVERY_MINUTES = 60
const WORK_STRESS_PER_MINUTE = 0.001
const OFF_STRESS_PER_MINUTE = 0.004
const SPEECH_ENERGY_COST = 0.025
const SPEECH_SOCIAL_COST = 0.02

/** Mon–Sat 10:00–18:00 Asia/Shanghai. Sunday is the off day. */
function isWorkHours(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(now)
    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? ''
    const hour = Number(parts.find((part) => part.type === 'hour')?.value)
    return weekday !== 'Sun' && Number.isFinite(hour) && hour >= 10 && hour < 18
  } catch {
    return false
  }
}

export class GroupLoopStore {
  constructor({ projectDir, personaPath, profilesPath, logger }) {
    this.projectDir = projectDir
    this.personaPath = personaPath
    this.profilesPath = profilesPath
    this.logger = logger
    this.root = join(projectDir, 'data', 'state', 'group-loop')
    this.characterPath = join(this.root, 'character.json')
    this.groupsPath = join(this.root, 'groups.json')
    this.memoryPath = join(this.root, 'memory.jsonl')
    this.messagesPath = join(this.root, 'messages.jsonl')
    this.processedPath = join(this.root, 'processed-loops.json')
    this.writeQueue = new SerialQueue()
  }

  async ensure() { await mkdir(this.root, { recursive: true }) }
  async readJson(path, fallback) { return readJsonFile(path, fallback) }

  async loadCharacter() {
    await this.ensure()
    const saved = await this.readJson(this.characterPath, null)
    const base = DEFAULTS()
    const persona = await this.readJson(this.personaPath, null)
    const core = {
      ...base.core,
      ...(saved?.core ?? {}),
      ...(saved === null && persona !== null && typeof persona.name === 'string' && persona.name !== ''
        ? { name: persona.name }
        : {}),
    }
    if (!Array.isArray(core.keywords)) core.keywords = Array.isArray(persona?.keywords) ? persona.keywords : []
    const character = { core, emotion: { ...base.emotion, ...(saved?.emotion ?? {}) }, updatedAt: saved?.updatedAt ?? null }
    if (saved === null) await this.saveCharacter(character)
    return character
  }

  async loadPersona() {
    if (typeof this.personaPath !== 'string' || this.personaPath === '') return null
    return this.readJson(this.personaPath, null)
  }

  async saveCharacter(character) {
    await this.ensure()
    const next = { ...character, updatedAt: new Date().toISOString() }
    await writeJsonAtomic(this.characterPath, next)
    return next
  }

  async loadGroups() {
    const saved = await this.readJson(this.groupsPath, null)
    return saved !== null && typeof saved === 'object' ? saved : { version: 1, groups: {} }
  }

  async saveGroups(groups) {
    await this.ensure()
    await writeJsonAtomic(this.groupsPath, { ...groups, updatedAt: new Date().toISOString() })
  }

  async loadProcessed() {
    const saved = await this.readJson(this.processedPath, { version: 1, loops: {} })
    return saved !== null && typeof saved === 'object' && saved.loops !== null && typeof saved.loops === 'object'
      ? saved
      : { version: 1, loops: {} }
  }

  async saveProcessed(processed) {
    const entries = Object.entries(processed.loops ?? {}).slice(-PROCESSED_LIMIT)
    await writeJsonAtomic(this.processedPath, { version: 1, loops: Object.fromEntries(entries), updatedAt: new Date().toISOString() })
  }

  async getProcessedLoop(loopId) {
    if (typeof loopId !== 'string' || loopId === '') return null
    const processed = await this.loadProcessed()
    return processed.loops[loopId] ?? null
  }

  async memories(limit = 50) {
    try {
      const text = await readFile(this.memoryPath, 'utf8')
      return text.split('\n').filter(Boolean).slice(-limit).map((line) => {
        try { return JSON.parse(line) } catch { return null }
      }).filter(Boolean)
    } catch { return [] }
  }

  async archiveMaterial(groupId, material) {
    const source = String(material ?? '')
    if (source === '') return 0
    const parsed = []
    for (const line of source.split('\n')) {
      const match = line.match(/^(?:【[^】]+】)?\[([^\]]+)\]\s+(.+?)\((\d*)\)\s+\[id:([^\]]+)\]：([\s\S]*)$/u)
      if (match === null) continue
      const at = new Date(match[1])
      parsed.push({
        id: match[4].trim(),
        groupId,
        at: Number.isNaN(at.getTime()) ? '' : at.toISOString(),
        time: match[1].trim(),
        qq: match[3],
        nickname: match[2].trim(),
        text: match[5].trim().slice(0, 2000),
      })
    }
    if (parsed.length === 0) return 0
    return this.writeQueue.run(async () => {
      const existing = await this.readMessages()
      const seen = new Set(existing.map((entry) => entry.id))
      const fresh = parsed.filter((entry) => !seen.has(entry.id))
      if (fresh.length === 0) return 0
      const rows = [...existing, ...fresh].slice(-MESSAGE_LIMIT)
      await writeTextAtomic(this.messagesPath, rows.map((entry) => `${JSON.stringify(entry)}\n`).join(''))
      return fresh.length
    })
  }

  async readMessages() {
    try {
      const text = await readFile(this.messagesPath, 'utf8')
      return text.split('\n').filter(Boolean).map((line) => {
        try { return JSON.parse(line) } catch { return null }
      }).filter(Boolean)
    } catch { return [] }
  }

  async searchMessages(groupId, query = '', limit = 10) {
    const rows = await this.readMessages()
    const needle = String(query ?? '').trim().toLowerCase()
    const max = Math.max(1, Math.min(20, Number(limit) || 10))
    const filtered = rows.filter((entry) => entry.groupId === groupId && (needle === '' || `${entry.nickname} ${entry.qq} ${entry.text}`.toLowerCase().includes(needle)))
    return filtered.slice(-max).reverse()
  }

  async hasMemoryForLoop(loopId) {
    if (typeof loopId !== 'string' || loopId === '') return false
    try {
      const text = await readFile(this.memoryPath, 'utf8')
      return text.split('\n').some((line) => {
        if (!line) return false
        try { return JSON.parse(line).loopId === loopId } catch { return false }
      })
    } catch { return false }
  }

  async appendMemory(entries, loopId = '', groupId = '') {
    if (!Array.isArray(entries) || entries.length === 0) return []
    if (await this.hasMemoryForLoop(loopId)) return []
    await this.ensure()
    const written = []
    const now = new Date().toISOString()
    for (const entry of entries.slice(0, MEMORY_WRITE_LIMIT)) {
      if (entry === null || typeof entry !== 'object' || typeof entry.summary !== 'string' || entry.summary.trim() === '') continue
      const memory = {
        id: `mem_${loopId || Date.now()}_${written.length}`,
        loopId,
        groupId: String(groupId ?? ''),
        at: now,
        summary: entry.summary.trim().slice(0, 500),
        kind: entry.kind === 'relationship' || entry.kind === 'reflection' ? entry.kind : 'event',
        importance: ['low', 'medium', 'high'].includes(entry.importance) ? entry.importance : 'medium',
        tags: Array.isArray(entry.tags) ? entry.tags.filter((tag) => typeof tag === 'string').slice(0, 6) : [],
        participants: Array.isArray(entry.participants) ? entry.participants.filter((id) => typeof id === 'string').slice(0, 12) : [],
      }
      written.push(memory)
    }
    if (written.length === 0) return []
    let existing = []
    try {
      existing = (await readFile(this.memoryPath, 'utf8')).split('\n').filter(Boolean)
    } catch { /* first memory */ }
    const kept = [...existing, ...written.map((memory) => JSON.stringify(memory))].slice(-MEMORY_LIMIT)
    await writeTextAtomic(this.memoryPath, `${kept.join('\n')}\n`)
    return written
  }

  async profilesFor(groupId, qqs = null) {
    if (this.profilesPath === null) return []
    const store = await loadProfileStore(this.profilesPath)
    const group = String(groupId)
    const wanted = Array.isArray(qqs) ? new Set(qqs.map((qq) => String(qq))) : null
    return Object.values(store.profiles)
      .filter((profile) => profile.groupId === group && (wanted === null || wanted.has(profile.qq)))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, 20)
  }

  async applyProfilesUnlocked(groupId, patches, participants) {
    if (this.profilesPath === null || !Array.isArray(patches) || patches.length === 0) return 0
    const store = await loadProfileStore(this.profilesPath)
    const names = new Map((participants ?? []).map((person) => [String(person.qq), String(person.nickname ?? '')]))
    let count = 0
    for (const entry of patches.slice(0, 8)) {
      if (entry === null || typeof entry !== 'object' || typeof entry.qq !== 'string' || entry.qq.trim() === '') continue
      const qq = entry.qq.trim()
      const ensured = ensureProfile(store, { groupId, userId: qq, userName: names.get(qq) })
      const patch = entry.patch !== null && typeof entry.patch === 'object' ? entry.patch : {}
      store.profiles[ensured.key] = mergeProfile(ensured.profile, patch)
      count += 1
    }
    await saveProfileStore(this.profilesPath, store)
    return count
  }

  async applyProfiles(groupId, patches, participants) {
    return this.writeQueue.run(() => this.applyProfilesUnlocked(groupId, patches, participants))
  }

  /** Apply a full state patch under one lock so concurrent groups cannot lose updates. */
  async applyStateUpdate({ loopId, groupId, patches, participants, emotionActive = true }) {
    return this.writeQueue.run(async () => {
      const processed = await this.loadProcessed()
      const cached = processed.loops[loopId]
      if (cached !== undefined) return { duplicate: true, result: cached }
      const character = await this.loadCharacter()
      const emotion = { ...character.emotion }
      const previousAt = Date.parse(character.updatedAt ?? '')
      const elapsedMinutes = Number.isFinite(previousAt)
        ? Math.min(12 * 60, Math.max(0, (Date.now() - previousAt) / 60_000))
        : 0
      const energyRecovery = 1 - Math.exp(-elapsedMinutes / ENERGY_RECOVERY_MINUTES)
      const socialRecovery = 1 - Math.exp(-elapsedMinutes / SOCIAL_RECOVERY_MINUTES)
      emotion.energy += (EMOTION_BASELINE.energy - emotion.energy) * energyRecovery
      emotion.socialBattery += (EMOTION_BASELINE.socialBattery - emotion.socialBattery) * socialRecovery
      if (isWorkHours()) emotion.stress += WORK_STRESS_PER_MINUTE * elapsedMinutes
      else emotion.stress -= OFF_STRESS_PER_MINUTE * elapsedMinutes
      emotion.valence += (EMOTION_BASELINE.valence - emotion.valence) * 0.04
      emotion.arousal += (EMOTION_BASELINE.arousal - emotion.arousal) * 0.04
      if (emotionActive === true) {
        const deltas = {}
        for (const key of ['valence', 'arousal', 'energy', 'socialBattery', 'stress']) {
          const rawDelta = Number(patches.emotion[`${key}Delta`])
          deltas[key] = Number.isFinite(rawDelta) ? Math.max(-EMOTION_DELTA_LIMIT, Math.min(EMOTION_DELTA_LIMIT, rawDelta)) : 0
        }
        // A social conflict should lower mood even if the model only raised stress.
        if (deltas.stress > 0.005 && deltas.valence >= 0) {
          deltas.valence = -Math.min(0.02, deltas.stress * 0.5)
        }
        for (const key of Object.keys(deltas)) emotion[key] += deltas[key]
        emotion.energy -= SPEECH_ENERGY_COST
        emotion.socialBattery -= SPEECH_SOCIAL_COST
      }
      for (const key of ['valence', 'arousal', 'energy', 'socialBattery', 'stress']) {
        const bounds = key === 'valence' ? [-1, 1] : [0, 1]
        emotion[key] = Math.min(bounds[1], Math.max(bounds[0], Number.isFinite(emotion[key]) ? emotion[key] : EMOTION_BASELINE[key]))
      }
      const saved = await this.saveCharacter({ ...character, emotion })
      const members = await this.appendMemory(patches.memory, loopId, groupId)
      const profileCount = await this.applyProfilesUnlocked(groupId, patches.userProfiles, participants)
      const groups = await this.loadGroups()
      const previous = groups.groups[groupId] !== null && typeof groups.groups[groupId] === 'object' ? groups.groups[groupId] : {}
      const groupState = patches.groupState
      groups.groups[groupId] = {
        ...previous,
        ...(typeof groupState.topic === 'string' && groupState.topic.trim() !== '' ? { topic: groupState.topic.trim().slice(0, 200) } : {}),
        ...(Array.isArray(groupState.participants) ? { participants: groupState.participants.filter((id) => typeof id === 'string').slice(0, 20) } : {}),
        ...(typeof groupState.unansweredQuestion === 'string' ? { unansweredQuestion: groupState.unansweredQuestion.trim().slice(0, 300) } : {}),
        lastLoop: loopId,
        updatedAt: new Date().toISOString(),
      }
      await this.saveGroups(groups)
      const result = {
        ok: true,
        memory: members.length,
        userProfiles: profileCount,
        emotionUpdated: emotionActive === true || elapsedMinutes > 0,
        groupStateUpdated: typeof groupState.topic === 'string' || Array.isArray(groupState.participants),
        character: saved,
        memoryIds: members.map((item) => item.id),
      }
      processed.loops[loopId] = result
      await this.saveProcessed(processed)
      return { duplicate: false, result }
    })
  }

  async groupState(groupId) {
    const groups = await this.loadGroups()
    const state = groups.groups?.[groupId]
    return state !== null && typeof state === 'object' ? state : {}
  }

  async dashboard(listenerPath, groupId = null) {
    const [character, groups, memories, persona] = await Promise.all([this.loadCharacter(), this.loadGroups(), this.memories(50), this.loadPersona()])
    const profiles = groupId === null || groupId === '' ? [] : await this.profilesFor(groupId)
    const listener = await this.readJson(listenerPath, null)
    return { character, persona, groups: groups.groups ?? {}, memories, profiles, listener, updatedAt: new Date().toISOString() }
  }
}
