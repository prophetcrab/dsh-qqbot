/**
 * AI HTTP routes: settings, profiles, prompt preview, status and the chat
 * gateway. The chat body is validated against host/contracts before use.
 */

import { validateAiChatRequest, normalizeAiChatRequest } from '../../contracts/index.js'
import { only, readBody, sendJson, stringField } from '../../kernel/http.js'
import {
  AI_SETTINGS_DEFAULTS,
  normalizeAiSettings,
  readAiSettings,
  writeAiSettings,
} from '../../services/ai/settings.js'

/** @param {object} api plugin API */
export function routes(api, { ai, aiSettingsPath, profilesPath, ensureEndpoint }) {
  return [
    {
      path: '/qqbot/ai/settings',
      handler: (req, res) => only(req, res, ['GET', 'POST'], async () => {
        if (req.method === 'GET') {
          sendJson(res, 200, { ok: true, data: { settings: await readAiSettings(aiSettingsPath), defaults: AI_SETTINGS_DEFAULTS, path: aiSettingsPath } })
          return
        }
        const body = await readBody(req)
        const saved = await writeAiSettings(aiSettingsPath, normalizeAiSettings(body))
        sendJson(res, 200, { ok: true, data: { settings: saved, defaults: AI_SETTINGS_DEFAULTS, path: aiSettingsPath } })
      }),
    },
    {
      path: '/qqbot/profiles',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        const url = new URL(req.url, 'http://localhost')
        const profiles = await ai.listProfiles({
          groupId: url.searchParams.get('groupId') ?? '',
          search: url.searchParams.get('search') ?? '',
        })
        sendJson(res, 200, { ok: true, data: { profiles, path: profilesPath } })
      }),
    },
    {
      path: '/qqbot/profiles/save',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        const body = await readBody(req)
        const profile = body.profile !== null && typeof body.profile === 'object' ? body.profile : body
        const saved = await ai.saveProfile(profile)
        if (saved === null) {
          sendJson(res, 400, { ok: false, error: '画像需要 groupId 与 qq' })
          return
        }
        sendJson(res, 200, { ok: true, data: { profile: saved, path: profilesPath } })
      }),
    },
    {
      path: '/qqbot/profiles/delete',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        const body = await readBody(req)
        const deleted = await ai.deleteProfile(typeof body.key === 'string' ? body.key : '')
        sendJson(res, 200, { ok: deleted, data: { deleted, path: profilesPath } })
      }),
    },
    {
      path: '/qqbot/ai/last-prompt',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        sendJson(res, 200, { ok: true, data: { prompt: ai.lastPromptSnapshot(), gate: ai.lastGateSnapshot() } })
      }),
    },
    {
      path: '/qqbot/ai/status',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        sendJson(res, 200, { ok: true, data: { ...ai.status(), endpoint: await ensureEndpoint() } })
      }),
    },
    {
      path: '/qqbot/ai/chat',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        const body = await readBody(req, 40 * 1024 * 1024)
        const validation = validateAiChatRequest(body)
        if (!validation.valid) {
          sendJson(res, 400, { ok: false, code: 'BAD_REQUEST', errors: validation.errors })
          return
        }
        const request = normalizeAiChatRequest(body)
        const { apiVersion: _apiVersion, ...chatOptions } = request
        const result = await ai.chat(chatOptions)
        sendJson(res, 200, { ...result, apiVersion: validation.apiVersion })
      }),
    },
  ]
}
