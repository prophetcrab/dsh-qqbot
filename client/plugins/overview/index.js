import { registerTab } from '../../runtime/tab-registry.js'
import { useOverview, renderOverview } from './OverviewTab.js'
import {
  loadLogin, loadSetup, refreshLoginQr,
  installKoishiEnv, runSetupFull, installSetupNapcat,
  startAll, stopAll, installNapcat, configureNapcat,
  startNapcat, stopNapcat, startKoishi, stopKoishi, restartKoishi, installDeps,
} from './OverviewActions.js'

registerTab({
  id: 'overview',
  labelKey: 'tabOverview',
  order: 0,
  use(panel) {
    useOverview(panel)
    return () => renderOverview(panel)
  },
  handlers: {
    loadLogin, loadSetup, refreshLoginQr,
    installKoishiEnv, runSetupFull, installSetupNapcat,
    startAll, stopAll, installNapcat, configureNapcat,
    startNapcat, stopNapcat, startKoishi, stopKoishi, restartKoishi, installDeps,
  },
})
