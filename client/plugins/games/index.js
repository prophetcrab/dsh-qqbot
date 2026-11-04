import { registerTab } from '../../runtime/tab-registry.js'
import { useGamesTab } from './GamesTab.js'

registerTab({
  id: 'games',
  labelKey: 'tabGames',
  order: 7,
  use(panel) {
    return useGamesTab(panel)
  },
  handlers: {},
})
