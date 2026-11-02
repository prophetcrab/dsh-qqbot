import { useOverview, renderOverview } from './OverviewTab.js'
import {
  loadLogin, loadSetup, refreshLoginQr,
  installKoishiEnv, runSetupFull, installSetupNapcat,
  startAll, stopAll, installNapcat, configureNapcat,
  startNapcat, stopNapcat, startKoishi, stopKoishi, restartKoishi, installDeps,
} from './OverviewActions.js'

export const id = 'overview'
export const labelKey = 'tabOverview'
export const handlers = {
  loadLogin, loadSetup, refreshLoginQr,
  installKoishiEnv, runSetupFull, installSetupNapcat,
  startAll, stopAll, installNapcat, configureNapcat,
  startNapcat, stopNapcat, startKoishi, stopKoishi, restartKoishi, installDeps,
}

export function use(panel) {
  useOverview(panel)
  return () => renderOverview(panel)
}
