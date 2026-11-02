/**
 * Persona HTTP routes: read/save the active card and manage preset cards.
 */

import { rm } from 'node:fs/promises'
import { only, readBody, sendJson } from '../../kernel/http.js'

/** @param {object} api plugin API @param {object} persona persona service */
export function routes(api, persona) {
  const activePersona = async () => (await persona.read()) ?? persona.normalize(persona.defaults)
  return [
    {
      path: '/qqbot/persona/presets',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        const store = await persona.loadPresets()
        const active = await activePersona()
        sendJson(res, 200, { ok: true, data: { presets: store.presets, active, path: persona.presetsPath } })
      }),
    },
    {
      path: '/qqbot/persona/presets/save',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        const body = await readBody(req)
        const store = await persona.loadPresets()
        const active = await activePersona()
        const card = body.persona !== null && typeof body.persona === 'object' ? persona.normalize(body.persona) : active
        const saved = persona.upsertPreset(store, {
          ...(typeof body.id === 'string' ? { id: body.id } : {}),
          ...(typeof body.name === 'string' && body.name.trim() !== '' ? { name: body.name } : { name: card.name }),
          persona: card,
        })
        await persona.savePresets(store)
        sendJson(res, 200, { ok: true, data: { preset: saved, presets: store.presets, path: persona.presetsPath } })
      }),
    },
    {
      path: '/qqbot/persona/presets/load',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        const body = await readBody(req)
        const store = await persona.loadPresets()
        const preset = store.presets.find((item) => item.id === body.id) ?? null
        if (preset === null) {
          sendJson(res, 404, { ok: false, error: '预设卡不存在' })
          return
        }
        const card = await persona.write(preset.persona)
        sendJson(res, 200, {
          ok: true,
          data: {
            preset,
            persona: card,
            promptPreview: persona.buildPrompt(card),
            presets: store.presets,
            path: persona.path,
          },
        })
      }),
    },
    {
      path: '/qqbot/persona/presets/delete',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        const body = await readBody(req)
        const store = await persona.loadPresets()
        const deleted = persona.removePreset(store, typeof body.id === 'string' ? body.id : '')
        if (deleted) await persona.savePresets(store)
        sendJson(res, 200, { ok: deleted, data: { deleted, presets: store.presets, path: persona.presetsPath } })
      }),
    },
    {
      path: '/qqbot/persona',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        const card = await activePersona()
        sendJson(res, 200, {
          ok: true,
          data: {
            persona: card,
            promptPreview: persona.buildPrompt(card),
            path: persona.path,
          },
        })
      }),
    },
    {
      path: '/qqbot/persona/save',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        const body = await readBody(req)
        if (body.reset === true) {
          await rm(persona.path, { force: true })
          const card = persona.normalize(persona.defaults)
          sendJson(res, 200, { ok: true, data: { persona: card, promptPreview: persona.buildPrompt(card), path: persona.path } })
          return
        }
        const payload = body.persona !== null && typeof body.persona === 'object' ? body.persona : body
        const saved = await persona.write(payload)
        sendJson(res, 200, { ok: true, data: { persona: saved, promptPreview: persona.buildPrompt(saved), path: persona.path } })
      }),
    },
  ]
}
