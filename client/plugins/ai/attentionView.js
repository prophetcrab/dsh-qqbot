/** Human-readable attention contribution breakdown for the runtime card. */

export function attentionFactors(t, inbound) {
  if (inbound.budgetExhausted) return [{ label: t('aiRuntimeFactorBudget'), delta: 0 }]
  if (inbound.attentionDecision === 'forced') return [{ label: t('aiRuntimeFactorForced'), delta: 100 }]
  const factors = []
  if (inbound.attentionReasons.includes('direct')) factors.push({ label: t('aiRuntimeFactorDirect'), delta: 25 })
  if (inbound.keywordScore > 0) factors.push({ label: t('aiRuntimeFactorKeyword'), delta: Math.round(Math.min(0.3, inbound.keywordScore * 0.3) * 100) })
  if (inbound.attentionReasons.includes('thread')) factors.push({ label: t('aiRuntimeFactorThread'), delta: 15 })
  if (inbound.attentionReasons.includes('question')) factors.push({ label: t('aiRuntimeFactorQuestion'), delta: 10 })
  if (inbound.attentionReasons.includes('silence')) factors.push({ label: t('aiRuntimeFactorSilence'), delta: 10 })
  if (inbound.attentionReasons.includes('recent-penalty')) factors.push({ label: t('aiRuntimeFactorRecent'), delta: -20 })
  return factors
}
