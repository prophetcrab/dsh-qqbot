/** Token usage tab styles; kept separate to respect the per-file size budget. */
export const TOKEN_CSS = `
/* ── Token usage ─────────────────────────────────────────────────── */
.qqbot-token-page { gap: 15px; }
.qqbot-token-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; padding: 8px 2px 4px; flex-wrap: wrap; }
.qqbot-token-eyebrow { color: var(--dsw-alias-brand-primary); font-size: 10px; font-weight: 700; letter-spacing: .14em; }
.qqbot-token-hero h1 { margin: 6px 0 4px; font-size: 28px; line-height: 1.12; letter-spacing: -.035em; color: var(--dsw-alias-label-primary); }
.qqbot-token-hero p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.qqbot-token-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.qqbot-token-confirm { display: flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary); font-size: 10.5px; }
.qqbot-ai-btn-danger { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, var(--dsw-alias-border-l1)); }
.qqbot-token-notice { padding: 8px 11px; border-radius: 9px; color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent); font-size: 10.5px; }
.qqbot-token-error h2 { margin: 0 0 5px; font-size: 13px; color: var(--dsw-alias-state-error-primary); }
.qqbot-token-error p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 10.5px; }
.qqbot-token-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.qqbot-token-metrics-secondary { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.qqbot-token-metric { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 3px; padding: 13px 14px; border: .5px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); }
.qqbot-token-metric::after { content: ''; position: absolute; right: -20px; bottom: -26px; width: 72px; height: 72px; border-radius: 50%; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent); }
.qqbot-token-metric.is-accent { background: linear-gradient(135deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, var(--dsw-alias-bg-layer-1)), var(--dsw-alias-bg-layer-1)); }
.qqbot-token-metric.is-violet::after { background: color-mix(in srgb, #7c3aed 10%, transparent); }
.qqbot-token-metric-label { color: var(--dsw-alias-label-tertiary); font-size: 10px; }
.qqbot-token-metric-value { color: var(--dsw-alias-label-primary); font-size: 22px; line-height: 1.1; letter-spacing: -.035em; }
.qqbot-token-metric-hint { color: var(--dsw-alias-label-tertiary); font-size: 9px; }
.qqbot-token-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 14px; align-items: start; }
.qqbot-token-groups, .qqbot-token-recent { display: flex; flex-direction: column; gap: 7px; }
.qqbot-token-group { padding: 9px 10px; border-radius: 9px; background: var(--dsw-alias-bg-base); border: .5px solid var(--dsw-alias-border-l1); display: flex; flex-direction: column; gap: 4px; }
.qqbot-token-group-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.qqbot-token-group-head strong { color: var(--dsw-alias-label-primary); font-size: 10.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.qqbot-token-group-head span { color: var(--dsw-alias-label-tertiary); font-size: 9px; }
.qqbot-token-group-numbers { display: flex; justify-content: space-between; gap: 8px; color: var(--dsw-alias-label-secondary); font-size: 9.5px; }
.qqbot-token-bar { height: 3px; border-radius: 999px; background: var(--dsw-alias-bg-base); overflow: hidden; }
.qqbot-token-bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--dsw-alias-brand-primary), color-mix(in srgb, #7c3aed 60%, var(--dsw-alias-brand-primary))); }
.qqbot-token-recent { max-height: 390px; overflow-y: auto; padding-right: 3px; }
.qqbot-token-recent-row { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 8px 9px; border-radius: 8px; background: var(--dsw-alias-bg-base); border: .5px solid var(--dsw-alias-border-l1); }
.qqbot-token-recent-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.qqbot-token-recent-main strong { color: var(--dsw-alias-label-primary); font-size: 9.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.qqbot-token-recent-main span { color: var(--dsw-alias-label-tertiary); font-size: 8.5px; }
.qqbot-token-recent-numbers { display: flex; gap: 7px; align-items: center; white-space: nowrap; color: var(--dsw-alias-label-tertiary); font-size: 8.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
@media (max-width: 900px) { .qqbot-token-grid { grid-template-columns: 1fr; } .qqbot-token-metrics, .qqbot-token-metrics-secondary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .qqbot-token-metrics, .qqbot-token-metrics-secondary { grid-template-columns: 1fr; } .qqbot-token-hero { align-items: flex-start; flex-direction: column; } }
`
