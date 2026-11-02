/** Durable state for the group-listener loop: character, groups, memory. */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureProfile, loadProfileStore, normalizeProfile, profileKey, saveProfileStore } from '../profiles/index.js'

const DEFAULTS = () => ({
  emotion: { valence: 0.08, arousal: 0.4, energy: 0.62, socialBattery: 0.55, stress: 0.16 },
  core: { name: '群友', identity: '群里的普通群友', voice: '简洁自然，不用客服腔' },
})

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
    this.seen = new Map()
    this.profileQueue = Promise.resolve()
  }

  async ensure() { await mkdir(this.root, { recursive: true }) }

  async readJson(path, fallback) {
    try { return JSON.parse(await readFile(path, 'utf8')) } catch { return fallback }
  }

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
        identity: [persona.role, persona.personality].filter(Boolean).join('；') || base.core.identity,
        voice: persona.tone || base.core.voice,
      } : {}),
    }
    const character = { core, emotion: { ...base.emotion, ...(saved?.emotion ?? {}) }, updatedAt: saved?.updatedAt ?? null }
    if (saved === null) await this.saveCharacter(character)
    return character
  }

  async saveCharacter(character) {
    await this.ensure()
    const next = { ...character, updatedAt: new Date().toISOString() }
    await writeFile(this.characterPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    return next
  }

  async loadGroups() {
    const saved = await this.readJson(this.groupsPath, null)
    return saved !== null && typeof saved === 'object' ? saved : { version: 1, groups: {} }
  }

  async saveGroups(groups) {
    await this.ensure()
    await writeFile(this.groupsPath, `${JSON.stringify({ ...groups, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
  }

  async memories(limit = 30) {
    try {
      const text = await readFile(this.memoryPath, 'utf8')
      return text.split('\n').filter(Boolean).slice(-limit).map((line) => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean)
    } catch { return [] }
  }

  async appendMemory(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return []
    await this.ensure()
    const written = []
    const now = new Date().toISOString()
    for (const entry of entries.slice(0, 8)) {
      if (entry === null || typeof entry !== 'object' || typeof entry.summary !== 'string' || entry.summary.trim() === '') continue
      const memory = {
        id: `mem_${Date.now()}_${written.length}`,
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

  async applyProfiles(groupId, patches) {
    if (this.profilesPath === null || !Array.isArray(patches) || patches.length === 0) return 0
    let count = 0
    const run = async () => {
      const store = await loadProfileStore(this.profilesPath)
      for (const entry of patches.slice(0, 8)) {
        if (entry === null || typeof entry !== 'object' || typeof entry.qq !== 'string' || entry.qq.trim() === '') continue
        const qq = entry.qq.trim()
        const ensured = ensureProfile(store, { groupId, userId: qq })
        const profile = ensured.profile
        const patch = entry.patch !== null && typeof entry.patch === 'object' ? entry.patch : {}
        for (const field of ['summary', 'personality', 'style', 'relationship', 'recent']) {
          if (typeof patch[field] === 'string' && patch[field].trim() !== '') profile[field] = patch[field].trim().slice(0, 500)
        }
        if (Array.isArray(patch.interests)) profile.interests = patch.interests.filter((v) => typeof v === 'string').slice(0, 12)
        profile.updatedAt = new Date().toISOString()
        count += 1
      }
      await saveProfileStore(this.profilesPath, store)
    }
    this.profileQueue = this.profileQueue.then(run, run)
    await this.profileQueue
    return count
  }

  async dashboard(listenerPath) {
    const [character, groups, memories] = await Promise.all([this.loadCharacter(), this.loadGroups(), this.memories(40)])
    const listener = await this.readJson(listenerPath, null)
    return { character, groups: groups.groups ?? {}, memories, listener, updatedAt: new Date().toISOString() }
  }
}
