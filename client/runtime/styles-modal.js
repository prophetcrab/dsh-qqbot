/** Install-progress modal styles, kept separate for the per-file size budget. */
export const MODAL_CSS = `
.qqbot-modal-backdrop { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: rgba(0, 0, 0, 0.36); backdrop-filter: blur(4px); }
.qqbot-modal { width: min(430px, 100%); padding: 22px; border-radius: 16px; display: flex; flex-direction: column; gap: 12px;
  background: var(--dsw-alias-bg-layer-1); border: 0.5px solid var(--dsw-alias-border-l1);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28); }
.qqbot-modal-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.qqbot-modal-title { margin: 0; font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.qqbot-modal-percent { font-size: 12px; color: var(--dsw-alias-brand-primary); font-variant-numeric: tabular-nums; }
.qqbot-modal-percent.is-bad { color: var(--dsw-alias-state-error-primary); }
.qqbot-modal-phase { margin: 0; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.qqbot-modal-track { height: 7px; border-radius: 999px; overflow: hidden; background: var(--dsw-alias-bg-layer-2); }
.qqbot-modal-fill { height: 100%; border-radius: inherit; background: var(--dsw-alias-brand-primary); transition: width 0.35s ease; }
.qqbot-modal-fill.is-indeterminate { width: 35% !important; animation: qqbot-modal-slide 1.2s ease-in-out infinite; }
@keyframes qqbot-modal-slide { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }
.qqbot-modal-meta, .qqbot-modal-hint { margin: 0; font-size: 10.5px; color: var(--dsw-alias-label-tertiary); }
.qqbot-modal-error { margin: 0; padding: 8px 10px; border-radius: 8px; font-size: 11px; line-height: 1.45;
  color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent); }
.qqbot-modal-actions { display: flex; justify-content: flex-end; }
`
