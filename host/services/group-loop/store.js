/** Durable state for the group-listener loop: character, groups, memory. */
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureProfile, loadProfileStore, mergeProfile, saveProfileStore } from '../profiles/index.js'
import { readJsonFile, SerialQueue, writeJsonAtomic } from './atomic.js'

const DEFAULTS = () => ({
  emotion: { valence: 0.08, arousal: 0.4, energy: 0.62, socialBattery: 0.55, stress: 0.16 },
  core: { name: '群友', identity: '群里的普通群友', voice: '简洁自然，不用客服腔' },
})

const PROCESSED_LIMIT = 500
const EMOTION_BASELINE = Object.freeze({ valence: 0.08, arousal: 0.4, energy: 0.62, socialBattery: 0.55, stress: 0.16 })
const EMOTION_DELTA_LIMIT = 0.03
const EMOTION_REGRESSION = 0.04

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
      ...(saved === null && persona !== null ? {
        name: persona.name || base.core.name,
        identity: persona.role || base.core.identity,
        voice: persona.tone || base.core.voice,
      } : {}),
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

  async memories(limit = 30) {
    try {
      const text = await readFile(this.memoryPath, 'utf8')
      return text.split('\n').filter(Boolean).slice(-limit).map((line) => {
        try { return JSON.parse(line) } catch { return null }
      }).filter(Boolean)
    } catch { return [] }
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

  async appendMemory(entries, loopId = '') {
    if (!Array.isArray(entries) || entries.length === 0) return []
    if (await this.hasMemoryForLoop(loopId)) return []
    await this.ensure()
    const written = []
    const now = new Date().toISOString()
    for (const entry of entries.slice(0, 8)) {
      if (entry === null || typeof entry !== 'object' || typeof entry.summary !== 'string' || entry.summary.trim() === '') continue
      const memory = {
        id: `mem_${loopId || Date.now()}_${written.length}`,
        loopId,
        at: now,
        summary: entry.summary.trim().slice(0, 500),
        kind: entry.kind === 'relationship' || entry.kind === 'reflection' ? entry.kind : 'event',
        importance: ['low', 'medium', 'high'].includes(entry.importance) ? entry.importance : 'medium',
        tags: Array.isArray(entry.tags) ? entry.tags.filter((tag) => typeof tag === 'string').slice(0, 6) : [],
        participants: Array.isArray(entry.participants) ? entry.participants.filter((id) => typeof id === 'string').slice(0, 12) : [],
      }
      await appendFile(this.memoryPath, `${JSON.stringify(memory)}\n`, 'utf8')
      written.push(memory)
    }
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
      if (emotionActive === true) {
        for (const key of ['valence', 'arousal', 'energy', 'socialBattery', 'stress']) {
          const rawDelta = Number(patches.emotion[`${key}Delta`])
          const delta = Number.isFinite(rawDelta) ? Math.max(-EMOTION_DELTA_LIMIT, Math.min(EMOTION_DELTA_LIMIT, rawDelta)) : 0
          const baseline = EMOTION_BASELINE[key]
          const bounds = key === 'valence' ? [-1, 1] : [0, 1]
          const afterDelta = Number(emotion[key]) + delta
          const afterRegression = afterDelta + (baseline - afterDelta) * EMOTION_REGRESSION
          emotion[key] = Math.min(bounds[1], Math.max(bounds[0], Number.isFinite(afterRegression) ? afterRegression : baseline))
        }
      }
      const saved = emotionActive === true ? await this.saveCharacter({ ...character, emotion }) : character
      const members = await this.appendMemory(patches.memory, loopId)
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
        emotionUpdated: emotionActive === true,
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
    const [character, groups, memories] = await Promise.all([this.loadCharacter(), this.loadGroups(), this.memories(40)])
    const profiles = groupId === null || groupId === '' ? [] : await this.profilesFor(groupId)
    const listener = await this.readJson(listenerPath, null)
    return { character, groups: groups.groups ?? {}, memories, profiles, listener, updatedAt: new Date().toISOString() }
  }
}
