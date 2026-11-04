import React from 'react'
import { formatTime, messageOf, requestJson } from '../../runtime/api.js'

const h = React.createElement

function row(panel, label, value, mono) {
  return h('div', { className: 'qqbot-row-item', key: label },
    h('span', { className: 'qqbot-row-label' }, label),
    h('span', { className: `qqbot-row-value${mono ? ' qqbot-mono' : ''}` }, value))
}

function stat(panel, label, value) {
  return h('div', { className: 'qqbot-admin-stat', key: label },
    h('span', { className: 'qqbot-admin-stat-label' }, label),
    h('span', { className: 'qqbot-admin-stat-value' }, value))
}

function table(panel, columns, rows) {
  return h('div', { className: 'qqbot-table-wrap' },
    h('table', { className: 'qqbot-table' },
      h('thead', null, h('tr', null, ...columns.map((column) => h('th', { key: column.key }, column.label)))),
      h('tbody', null, ...rows)))
}

function useGames(panel) {
  const { t } = panel
  const [groups, setGroups] = React.useState(null)
  const [groupsPhase, setGroupsPhase] = React.useState('idle')
  const [groupsError, setGroupsError] = React.useState(null)
  const [selectedGroupId, setSelectedGroupId] = React.useState(null)
  const [group, setGroup] = React.useState(null)
  const [groupPhase, setGroupPhase] = React.useState('idle')
  const [groupError, setGroupError] = React.useState(null)
  const [selectedGameId, setSelectedGameId] = React.useState(null)
  const [game, setGame] = React.useState(null)
  const [gamePhase, setGamePhase] = React.useState('idle')
  const [gameError, setGameError] = React.useState(null)
  const [upDraft, setUpDraft] = React.useState(null)
  const [savingUp, setSavingUp] = React.useState(false)
  const [notice, setNotice] = React.useState(null)

  const loadGroups = async () => {
    setGroupsPhase('loading')
    try {
      const payload = await requestJson('/qqbot/game/admin/groups')
      setGroups(payload && payload.data ? payload.data : { groups: [], games: [] })
      setGroupsError(null)
      setGroupsPhase('ready')
    } catch (error) {
      setGroupsError(messageOf(error))
      setGroupsPhase('error')
    }
  }

  const loadGroup = async (groupId) => {
    setGroupPhase('loading')
    setGroupError(null)
    try {
      const payload = await requestJson(`/qqbot/game/admin/group?groupId=${encodeURIComponent(groupId)}`)
      setGroup(payload && payload.data ? payload.data : null)
      setGroupPhase('ready')
    } catch (error) {
      setGroupError(messageOf(error))
      setGroupPhase('error')
    }
  }

  const loadGame = async (groupId, gameId) => {
    setGamePhase('loading')
    setGameError(null)
    try {
      const payload = await requestJson(`/qqbot/game/admin/game?groupId=${encodeURIComponent(groupId)}&gameId=${encodeURIComponent(gameId)}`)
      const data = payload && payload.data ? payload.data : null
      setGame(data)
      setUpDraft(data ? { rodId: data.up.rodId, baitId: data.up.baitId } : null)
      setGamePhase('ready')
    } catch (error) {
      setGameError(messageOf(error))
      setGamePhase('error')
    }
  }

  React.useEffect(() => { void loadGroups() }, [])
  React.useEffect(() => {
    if (selectedGroupId === null) return
    void loadGroup(selectedGroupId)
  }, [selectedGroupId])
  React.useEffect(() => {
    if (selectedGroupId === null || selectedGameId === null) return
    void loadGame(selectedGroupId, selectedGameId)
  }, [selectedGroupId, selectedGameId])

  const openGroup = (groupId) => {
    setSelectedGroupId(groupId)
    setSelectedGameId(null)
    setGroup(null)
    setGame(null)
    setNotice(null)
  }
  const openGame = (gameId) => {
    setSelectedGameId(gameId)
    setGame(null)
    setUpDraft(null)
    setNotice(null)
  }
  const backGroups = () => {
    setSelectedGroupId(null)
    setSelectedGameId(null)
    setGroup(null)
    setGame(null)
    setNotice(null)
  }
  const backGroup = () => {
    setSelectedGameId(null)
    setGame(null)
    setUpDraft(null)
    setNotice(null)
  }
  const saveUp = async () => {
    if (selectedGroupId === null || selectedGameId === null || upDraft === null || savingUp) return
    setSavingUp(true)
    setNotice(null)
    try {
      const payload = await requestJson('/qqbot/game/admin/up', {
        method: 'POST',
        body: {
          groupId: selectedGroupId,
          gameId: selectedGameId,
          rodId: upDraft.rodId,
          baitId: upDraft.baitId,
        },
      })
      if (payload && payload.data) {
        setGame(payload.data)
        setUpDraft({ rodId: payload.data.up.rodId, baitId: payload.data.up.baitId })
      }
      setNotice({ kind: 'ok', text: t('gamesUpSaved') })
    } catch (error) {
      setNotice({ kind: 'error', text: `${t('gamesUpFailed')}: ${messageOf(error)}` })
    } finally {
      setSavingUp(false)
    }
  }

  return {
    t, groups, groupsPhase, groupsError, selectedGroupId, group, groupPhase, groupError,
    selectedGameId, game, gamePhase, gameError, upDraft, setUpDraft, savingUp, notice,
    loadGroups, loadGroup, loadGame, openGroup, openGame, backGroups, backGroup, saveUp,
  }
}

function renderGroups(panel, state) {
  const { t } = state
  const data = state.groups
  const items = data && Array.isArray(data.groups) ? data.groups : []
  return h('div', { className: 'qqbot-stack' },
    h('div', { className: 'qqbot-toolbar' },
      h('div', { className: 'qqbot-toolbar-left' },
        h('h2', { className: 'qqbot-card-title', 'data-testid': 'qqbot-games-title' }, t('gamesTitle')),
        h('span', { className: 'qqbot-card-sub' }, t('gamesSubtitle'))),
      h('div', { className: 'qqbot-toolbar-right' },
        h('button', {
          type: 'button', className: 'qqbot-btn', 'data-testid': 'qqbot-games-refresh',
          disabled: state.groupsPhase === 'loading', onClick: () => { void state.loadGroups() },
        }, t('gamesRefresh')))),
    state.groupsPhase === 'loading' && data === null ? h('div', { className: 'qqbot-empty' }, t('gamesLoading')) : null,
    state.groupsError !== null ? h('div', { className: 'qqbot-banner qqbot-banner-error' }, `${t('gamesLoadFail')}: ${state.groupsError}`) : null,
    data !== null && items.length === 0 ? h('div', { className: 'qqbot-empty' }, t('gamesEmpty')) : null,
    h('div', { className: 'qqbot-grid' }, ...items.map((entry) => h('button', {
      type: 'button',
      key: entry.groupId,
      className: 'qqbot-card qqbot-game-card',
      'data-testid': `qqbot-game-group-${entry.groupId}`,
      onClick: () => { state.openGroup(entry.groupId) },
    },
      h('div', { className: 'qqbot-card-head' },
        h('div', null,
          h('h2', { className: 'qqbot-card-title' }, `${t('gamesGroup')} ${entry.groupId}`),
          h('p', { className: 'qqbot-card-sub' }, `${t('gamesLastUpdated')} ${formatTime(entry.updatedAt) || '—'}`)),
        h('span', { className: 'qqbot-badge' }, t('gamesOpen'))),
      h('div', { className: 'qqbot-admin-stats' },
        stat(panel, t('gamesUserCount'), entry.userCount),
        stat(panel, t('gamesTotalCoins'), entry.totalCoins),
        stat(panel, t('gamesTotalFishingCoins'), entry.totalFishingCoins)),
      h('div', { className: 'qqbot-actions-row' }, ...(entry.games || []).map((game) => h('span', {
        key: game.id,
        className: 'qqbot-badge',
      }, `${game.name && (game.name.zh || game.name.en) ? (game.name.zh || game.name.en) : game.id} · ${game.playerCount}`)))))))
}

function renderGroup(panel, state) {
  const { t } = state
  const data = state.group
  return h('div', { className: 'qqbot-stack' },
    h('div', { className: 'qqbot-toolbar' },
      h('div', { className: 'qqbot-toolbar-left' },
        h('button', {
          type: 'button', className: 'qqbot-btn', 'data-testid': 'qqbot-games-back',
          onClick: () => { state.backGroups() },
        }, t('gamesBackGroups')),
        h('h2', { className: 'qqbot-card-title' }, `${t('gamesGroup')} ${state.selectedGroupId}`)),
      h('div', { className: 'qqbot-toolbar-right' },
        h('button', {
          type: 'button', className: 'qqbot-btn', onClick: () => { void state.loadGroup(state.selectedGroupId) },
        }, t('gamesRefresh')))),
    state.groupPhase === 'loading' && data === null ? h('div', { className: 'qqbot-empty' }, t('gamesLoading')) : null,
    state.groupError !== null ? h('div', { className: 'qqbot-banner qqbot-banner-error' }, `${t('gamesLoadFail')}: ${state.groupError}`) : null,
    data === null ? null : h('div', { className: 'qqbot-stack' },
      h('div', { className: 'qqbot-admin-stats qqbot-admin-stats-wide' },
        stat(panel, t('gamesGroupId'), data.groupId),
        stat(panel, t('gamesUserCount'), data.users.length),
        stat(panel, t('gamesLastUpdated'), formatTime(data.updatedAt) || '—')),
      h('h3', { className: 'qqbot-card-title' }, t('gamesGames')),
      h('div', { className: 'qqbot-grid' }, ...(data.games || []).map((game) => h('button', {
        type: 'button',
        key: game.id,
        className: 'qqbot-card qqbot-game-card',
        'data-testid': `qqbot-game-open-${game.id}`,
        onClick: () => { state.openGame(game.id) },
      },
        h('div', { className: 'qqbot-card-head' },
          h('div', null,
            h('h2', { className: 'qqbot-card-title' }, game.name && (game.name.zh || game.name.en) || game.id),
            h('p', { className: 'qqbot-card-sub' }, game.description && (game.description.zh || game.description.en) || '')),
          h('span', { className: 'qqbot-badge' }, `${t('gamesPlayerCount')} ${game.playerCount}`)),
        h('span', { className: 'qqbot-btn' }, t('gamesOpen'))))),
      h('h3', { className: 'qqbot-card-title' }, t('gamesUsers')),
      data.users.length === 0 ? h('div', { className: 'qqbot-empty' }, t('gamesNoUsers')) : table(panel,
        [
          { key: 'qq', label: t('gamesQQ') },
          { key: 'nickname', label: t('gamesNickname') },
          { key: 'coins', label: t('gamesAccountCoins') },
          { key: 'fishingCoins', label: t('gamesFishingCoins') },
          { key: 'fishCount', label: t('gamesFishCount') },
          { key: 'registeredAt', label: t('gamesRegisteredAt') },
        ],
        data.users.map((user) => h('tr', { key: user.qq },
          h('td', { className: 'qqbot-mono' }, user.qq),
          h('td', null, user.nickname),
          h('td', null, user.coins),
          h('td', null, user.fishingCoins),
          h('td', null, user.fishCount),
          h('td', { className: 'qqbot-card-sub' }, formatTime(user.registeredAt) || '—'))))) )
}

function renderGame(panel, state) {
  const { t, game, upDraft } = state
  if (state.gamePhase === 'loading' && game === null) return h('div', { className: 'qqbot-empty' }, t('gamesLoading'))
  if (state.gameError !== null) return h('div', { className: 'qqbot-empty' }, h('p', { className: 'qqbot-error' }, `${t('gamesLoadFail')}: ${state.gameError}`))
  if (game === null) return h('div', { className: 'qqbot-empty' }, t('gamesLoading'))
  const up = game.up
  const rodOptions = up.options && Array.isArray(up.options.rods) ? up.options.rods : []
  const baitOptions = up.options && Array.isArray(up.options.baits) ? up.options.baits : []
  const update = (key, value) => {
    state.setUpDraft((previous) => (previous === null ? previous : { ...previous, [key]: value }))
  }
  return h('div', { className: 'qqbot-stack' },
    h('div', { className: 'qqbot-toolbar' },
      h('div', { className: 'qqbot-toolbar-left' },
        h('button', { type: 'button', className: 'qqbot-btn', 'data-testid': 'qqbot-games-back', onClick: () => { state.backGroup() } }, t('gamesBackGroup')),
        h('h2', { className: 'qqbot-card-title' }, `${game.game.name && (game.game.name.zh || game.game.name.en) || game.game.id} · ${game.groupId}`)),
      h('div', { className: 'qqbot-toolbar-right' },
        h('button', { type: 'button', className: 'qqbot-btn', onClick: () => { void state.loadGame(state.selectedGroupId, state.selectedGameId) } }, t('gamesRefresh')))),
    state.notice !== null ? h('div', { className: `qqbot-banner qqbot-banner-${state.notice.kind}` }, state.notice.text) : null,
    h('div', { className: 'qqbot-admin-stats qqbot-admin-stats-wide' },
      stat(panel, t('gamesUserCount'), game.summary.userCount),
      stat(panel, t('gamesActiveCasts'), game.summary.activeCasts),
      stat(panel, t('gamesTotalFishingCoins'), game.summary.totalFishingCoins),
      stat(panel, t('gamesTotalFish'), game.summary.totalFish),
      stat(panel, t('gamesTotalFishValue'), game.summary.totalFishValue)),
    h('div', { className: 'qqbot-card' },
      h('div', { className: 'qqbot-card-head' },
        h('h2', { className: 'qqbot-card-title' }, t('gamesCurrentUp')),
        h('span', { className: 'qqbot-badge' }, `${up.rod} / ${up.bait}`)),
      h('div', { className: 'qqbot-admin-up' },
        h('label', { className: 'qqbot-field' },
          h('span', { className: 'qqbot-field-label' }, t('gamesUpRod')),
          h('select', {
            className: 'qqbot-select', 'data-testid': 'qqbot-games-up-rod',
            value: upDraft ? upDraft.rodId : up.rodId,
            disabled: state.savingUp,
            onChange: (event) => { update('rodId', event.currentTarget.value) },
          }, ...rodOptions.map((item) => h('option', { key: item.id, value: item.id }, item.name)))),
        h('label', { className: 'qqbot-field' },
          h('span', { className: 'qqbot-field-label' }, t('gamesUpBait')),
          h('select', {
            className: 'qqbot-select', 'data-testid': 'qqbot-games-up-bait',
            value: upDraft ? upDraft.baitId : up.baitId,
            disabled: state.savingUp,
            onChange: (event) => { update('baitId', event.currentTarget.value) },
          }, ...baitOptions.map((item) => h('option', { key: item.id, value: item.id }, item.name)))),
        h('button', {
          type: 'button', className: 'qqbot-btn qqbot-btn-primary', 'data-testid': 'qqbot-games-up-save',
          disabled: state.savingUp || upDraft === null, onClick: () => { void state.saveUp() },
        }, state.savingUp ? t('gamesSaving') : t('gamesSaveUp')))),
    h('h3', { className: 'qqbot-card-title' }, t('gamesPlayers')),
    game.users.length === 0 ? h('div', { className: 'qqbot-empty' }, t('gamesNoUsers')) : table(panel,
      [
        { key: 'qq', label: t('gamesPlayer') },
        { key: 'fishingCoins', label: t('gamesFishingCoins') },
        { key: 'rods', label: t('gamesRods') },
        { key: 'baits', label: t('gamesBaits') },
        { key: 'tickets', label: t('gamesTickets') },
        { key: 'fish', label: t('gamesFishCount') },
        { key: 'pity', label: t('gamesPity') },
        { key: 'cast', label: t('gamesCast') },
      ],
      game.users.map((user) => {
        const equipped = user.rods.find((rod) => rod.id === user.equippedRod)
        const selected = user.baits.find((bait) => bait.id === user.selectedBait)
        const rods = user.rods.length === 0 ? '—' : `${user.rods.length} ${t('gamesRodsOwned')}${equipped ? ` · ${equipped.name}` : ''}`
        const baits = user.baits.length === 0 ? '—' : `${user.baits.length} ${t('gamesBaitsOwned')}${selected ? ` · ${selected.name}` : ''}`
        const pity = `竿 ${user.gacha.rodPity} · Lv3 ${user.gacha.lv3RodPity} · 饵 ${user.gacha.legendaryBaitPity} · 传奇 ${user.gacha.legendaryRodPity}`
        const cast = user.cast === null ? t('gamesCastIdle') : `${t('gamesCastActive')} · ${formatTime(user.cast.readyAt) || ''}`
        return h('tr', { key: user.qq },
          h('td', null,
            h('div', { className: 'qqbot-plugin-name' }, user.nickname),
            h('span', { className: 'qqbot-card-sub qqbot-mono' }, user.qq)),
          h('td', null, user.fishingCoins),
          h('td', null, rods),
          h('td', null, baits),
          h('td', null, `单 ${user.singleTickets} / 十 ${user.tenTickets}`),
          h('td', null, `${user.fishCount} · ${user.fishValue}`),
          h('td', { className: 'qqbot-card-sub' }, pity),
          h('td', null, cast))
      })))
}

export function useGamesTab(panel) {
  const state = useGames(panel)
  return () => {
    if (state.selectedGameId !== null) return renderGame(panel, state)
    if (state.selectedGroupId !== null) return renderGroup(panel, state)
    return renderGroups(panel, state)
  }
}
