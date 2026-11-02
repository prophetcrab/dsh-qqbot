import React from 'react'
import { requestJson, messageOf, formatTime } from '../../runtime/api.js'

export async function loadMessages(panel) {
  const { setMessages, setMessagesPhase, setMessagesError, setMessagesUpdatedAt, messagesPollRef } = panel
  if (messagesPollRef.current) return
  messagesPollRef.current = true
  try {
    const payload = await requestJson('/qqbot/messages?limit=50')
    const container = payload && payload.data !== undefined ? payload.data : payload
    const list = container !== null && typeof container === 'object' && Array.isArray(container.messages)
      ? container.messages
      : []
    setMessages(list)
    setMessagesUpdatedAt(container && typeof container.updatedAt === 'string' ? container.updatedAt : null)
    setMessagesError(null)
    setMessagesPhase('ready')
  } catch (error) {
    setMessagesError(messageOf(error))
    setMessagesPhase('error')
  } finally {
    messagesPollRef.current = false
  }
}

export function renderMessages(panel) {
  const {
    t, contacts, messages, messagesPhase, messagesError, messagesFilter, setMessagesFilter,
    messagesUpdatedAt, loadMessages, h
  } = panel
  const contactGroups = contacts !== null && Array.isArray(contacts.groups) ? contacts.groups : []
  const contactFriends = contacts !== null && Array.isArray(contacts.friends) ? contacts.friends : []
  const groupNames = new Map(contactGroups.map((group) => [String(group.id), group.name]))
  const friendNames = new Map(contactFriends.map((friend) => [String(friend.id), friend.name]))
  const items = Array.isArray(messages) ? messages : []
  const shown = items.filter((message) => {
    if (messagesFilter === 'all') return true
    const scene = message.scene === 'private' ? 'private' : 'group'
    return scene === messagesFilter
  })
  const sourceOf = (message) => {
    const scene = message.scene === 'private' ? 'private' : 'group'
    if (scene === 'group') {
      const id = String(message.groupId !== undefined && message.groupId !== null ? message.groupId : (message.targetId ?? ''))
      return groupNames.get(id) || id || t('messagesUnknownSource')
    }
    // Private messages may carry the bot as targetId, so try the sender id
    // first and fall back to the target before showing a raw number.
    const candidates = [message.userId, message.targetId]
      .filter((value) => value !== undefined && value !== null && String(value) !== '')
      .map((value) => String(value))
    for (const id of candidates) {
      const name = friendNames.get(id)
      if (name !== undefined) return name
    }
    return candidates.length > 0 ? candidates[0] : t('messagesUnknownSource')
  }
  const senderOf = (message) => {
    if (typeof message.userName === 'string' && message.userName !== '') return message.userName
    if (message.userId !== undefined && message.userId !== null) return String(message.userId)
    return t('messagesUnknownSource')
  }
  const filterOptions = [
    h('option', { key: 'all', value: 'all' }, t('messagesFilterAll')),
    h('option', { key: 'group', value: 'group' }, t('messagesFilterGroup')),
    h('option', { key: 'private', value: 'private' }, t('messagesFilterPrivate')),
  ]
  const toolbar = h('div', { className: 'qqbot-toolbar' },
    h('div', { className: 'qqbot-toolbar-left' },
      h('h2', { className: 'qqbot-card-title' }, t('messagesTitle')),
      h('span', { className: 'qqbot-card-sub' }, messagesUpdatedAt !== null
        ? `${t('updated')} ${formatTime(messagesUpdatedAt)}`
        : '')),
    h('div', { className: 'qqbot-toolbar-right' },
      h('select', {
        id: 'qqbot-messages-filter',
        className: 'qqbot-select',
        'data-testid': 'qqbot-messages-filter',
        'aria-label': t('messagesFilterAll'),
        value: messagesFilter,
        onChange: (event) => { setMessagesFilter(event.currentTarget.value) },
      }, ...filterOptions),
      h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'data-testid': 'qqbot-messages-refresh',
        'aria-label': t('messagesRefresh'),
        disabled: messagesPhase === 'loading',
        onClick: () => { loadMessages() },
      }, t('refresh'))))
  const list = h('div', { className: 'qqbot-message-list', 'data-testid': 'qqbot-messages-list' },
    ...shown.map((message, index) => {
      const direction = message.direction === 'out' ? 'out' : 'in'
      return h('div', {
        key: message.id !== undefined && message.id !== null ? String(message.id) : `message-${index}`,
        className: 'qqbot-message-row',
        'data-testid': 'qqbot-message-row',
        'data-direction': direction,
        'data-scene': message.scene === 'private' ? 'private' : 'group',
      },
        h('div', { className: 'qqbot-message-meta' },
          h('span', {
            className: `qqbot-message-direction qqbot-message-${direction}`,
            'data-testid': 'qqbot-message-direction',
          }, direction === 'in' ? t('messagesDirectionIn') : t('messagesDirectionOut')),
          h('span', { className: 'qqbot-message-time' }, formatTime(message.time) || '—'),
          h('span', { className: 'qqbot-message-source' }, sourceOf(message)),
          h('span', { className: 'qqbot-message-sender' }, senderOf(message))),
        h('div', { className: 'qqbot-message-content' },
          typeof message.content === 'string' ? message.content : ''))
    }))
  const empty = messages !== null && shown.length === 0
    ? h('div', { className: 'qqbot-empty' }, t('messagesEmpty'))
    : null
  return h('div', { className: 'qqbot-stack' },
    toolbar,
    messagesError !== null
      ? h('div', { className: 'qqbot-banner qqbot-banner-error', role: 'alert' }, `${t('messagesLoadFail')}: ${messagesError}`)
      : null,
    messagesPhase === 'loading' && messages === null
      ? h('div', { className: 'qqbot-empty', role: 'status' }, t('messagesLoading'))
      : null,
    messages !== null ? h('div', { className: 'qqbot-card' }, list) : null,
    empty)
}

/** Messages hooks: lazy-load on first open and poll every 2s while visible. */
export function useMessages(panel) {
  const { tab, messagesPhase, loadMessages, tabRef } = panel

  React.useEffect(() => {
    if (tab === 'messages' && messagesPhase === 'idle') loadMessages()
  }, [tab, messagesPhase])

  React.useEffect(() => {
    let disposed = false
    const tick = () => {
      if (disposed) return
      if (tabRef.current === 'messages') loadMessages()
    }
    const timer = setInterval(tick, 2000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [])
}
