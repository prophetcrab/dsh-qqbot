/**
 * Panel stylesheet: design tokens, layout, hover/focus states.
 * Kept as one module so the bundle still ships exactly one <style> element.
 */
import { TOKEN_CSS } from './styles-tokens.js'

export const CSS = `
.qqbot-page { box-sizing: border-box; width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden;
  max-width: 1120px; margin: 0 auto; padding: 24px 28px 64px; display: flex; flex-direction: column; gap: 16px;
  background: radial-gradient(80% 40% at 100% 0%, color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent), transparent 70%),
              var(--dsw-alias-bg-base); }
.qqbot-page *, .qqbot-page *::before, .qqbot-page *::after { box-sizing: border-box; }
/* Keep sections at their natural height: a flex child with overflow hidden collapses. */
.qqbot-page > * { flex: 0 0 auto; min-height: 0; }
.qqbot-page button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }

.qqbot-hero { border: 0.5px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, var(--dsw-alias-border-l1));
  border-radius: 20px; padding: 22px 26px; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px;
  background: radial-gradient(120% 160% at 100% 0%, color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent), transparent 60%),
              var(--dsw-alias-bg-layer-1); }
.qqbot-hero-main { min-width: 0; }
.qqbot-hero-side { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; flex: none; }
.qqbot-platform-badge { display: inline-flex; align-items: center; gap: 5px; align-self: flex-end;
  font-size: 10.5px; line-height: 1.4; padding: 3px 10px; border-radius: 999px;
  border: 0.5px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 35%, var(--dsw-alias-border-l1));
  color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, var(--dsw-alias-bg-layer-1));
  font-variant-numeric: tabular-nums; }
.qqbot-eyebrow { display: inline-flex; align-items: center; gap: 7px; font-size: 10.5px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--dsw-alias-brand-primary); font-weight: 500; }
.qqbot-eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
.qqbot-title { margin: 8px 0 0; font-size: 25px; line-height: 1.16; font-weight: 500; letter-spacing: -0.015em;
  color: var(--dsw-alias-label-primary); }
.qqbot-sub { margin: 8px 0 0; font-size: 12.5px; line-height: 1.55; color: var(--dsw-alias-label-secondary); max-width: 64ch; }

.qqbot-pills { display: flex; flex-wrap: wrap; gap: 7px; justify-content: flex-end; }
.qqbot-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; padding: 4px 10px;
  border-radius: 999px; border: 0.5px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary);
  white-space: nowrap; }
.qqbot-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.qqbot-pill-label { opacity: .8; }
.qqbot-pill-ok { color: var(--dsw-alias-state-success-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, var(--dsw-alias-border-l1)); }
.qqbot-pill-warn { color: var(--dsw-alias-state-warn-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, var(--dsw-alias-border-l1)); }
.qqbot-pill-bad { color: var(--dsw-alias-state-error-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, var(--dsw-alias-border-l1)); }

.qqbot-btn { appearance: none; border: 0.5px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; padding: 7px 13px; border-radius: 10px;
  cursor: pointer; white-space: nowrap; transition: transform .15s ease, border-color .15s ease, background .15s ease; }
.qqbot-btn:hover:not(:disabled) { transform: translateY(-1px); border-color: var(--dsw-alias-brand-primary); }
.qqbot-btn:disabled { opacity: .55; cursor: default; }
.qqbot-btn-primary { border-color: transparent; background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-label-primary-inverted, #fff); font-weight: 500; }
.qqbot-btn-danger { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, var(--dsw-alias-border-l1));
  color: var(--dsw-alias-state-error-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, var(--dsw-alias-bg-layer-1)); }
.qqbot-btns { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

.qqbot-banner { border-radius: 12px; padding: 9px 14px; font-size: 12px; line-height: 1.5;
  border: 0.5px solid var(--dsw-alias-border-l1); }
.qqbot-banner-error { color: var(--dsw-alias-state-error-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, var(--dsw-alias-border-l1));
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, var(--dsw-alias-bg-layer-1)); }
.qqbot-banner-ok { color: var(--dsw-alias-state-success-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, var(--dsw-alias-border-l1));
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, var(--dsw-alias-bg-layer-1)); }
.qqbot-warn { margin: 0; font-size: 11.5px; color: var(--dsw-alias-state-warn-primary); }
.qqbot-error { margin: 0; font-size: 11.5px; color: var(--dsw-alias-state-error-primary); line-height: 1.5; }
.qqbot-hint { margin: 0; font-size: 11.5px; line-height: 1.55; color: var(--dsw-alias-label-tertiary); }
.qqbot-empty { border: 0.5px dashed var(--dsw-alias-border-l1); border-radius: 14px; padding: 22px;
  text-align: center; font-size: 12.5px; color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1); display: flex; flex-direction: column; align-items: center; gap: 10px; }

.qqbot-tabs { display: inline-flex; gap: 2px; padding: 3px; border-radius: 12px; align-self: flex-start;
  border: 0.5px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 80%, transparent); }
.qqbot-tab { appearance: none; border: none; background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12px; padding: 6px 14px; border-radius: 9px; cursor: pointer; transition: all .15s ease; }
.qqbot-tab:hover { color: var(--dsw-alias-label-primary); }
.qqbot-tab.active { background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-inverted, #fff);
  font-weight: 500; }

.qqbot-body { display: flex; flex-direction: column; gap: 14px; min-height: 0; }
.qqbot-stack { display: flex; flex-direction: column; gap: 14px; }
.qqbot-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.qqbot-card { border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 16px; background: var(--dsw-alias-bg-layer-1);
  padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.qqbot-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.qqbot-card-title { margin: 0; font-size: 13.5px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.qqbot-card-sub { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.qqbot-feature-head { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.qqbot-rows { display: flex; flex-direction: column; gap: 7px; }
.qqbot-row-item { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; font-size: 11.5px; }
.qqbot-row-label { color: var(--dsw-alias-label-tertiary); flex: none; }
.qqbot-row-value { color: var(--dsw-alias-label-primary); text-align: right; min-width: 0; overflow-wrap: anywhere; }
.qqbot-row-value.is-ok { color: var(--dsw-alias-state-success-primary); }
.qqbot-row-value.is-warn { color: var(--dsw-alias-state-warn-primary); }
.qqbot-row-value.is-bad { color: var(--dsw-alias-state-error-primary); }
.qqbot-actions-row { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
.qqbot-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px;
  word-break: break-all; }

.qqbot-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
.qqbot-toolbar-left, .qqbot-toolbar-right { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.qqbot-seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px;
  border: 0.5px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.qqbot-seg-btn { appearance: none; border: none; background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 11.5px; padding: 5px 11px; border-radius: 8px; cursor: pointer; }
.qqbot-seg-btn.active { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-weight: 500; }
.qqbot-check { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px;
  color: var(--dsw-alias-label-secondary); cursor: pointer; }
.qqbot-check input { accent-color: var(--dsw-alias-brand-primary); }

.qqbot-input { flex: 1 1 260px; min-width: 200px; font: inherit; font-size: 12px;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 9px; padding: 7px 10px; }
.qqbot-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }

.qqbot-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.qqbot-table th { text-align: left; font-weight: 500; font-size: 11px; color: var(--dsw-alias-label-tertiary);
  padding: 6px 10px; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.qqbot-table td { padding: 8px 10px; border-bottom: 0.5px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary); vertical-align: middle; }
.qqbot-table tr:last-child td { border-bottom: none; }
.qqbot-table tbody tr:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, transparent); }
.qqbot-plugin-name { color: var(--dsw-alias-label-primary); font-weight: 500; margin-right: 6px; }
.qqbot-plugin-package { display: block; color: var(--dsw-alias-label-tertiary); margin-top: 2px; }
.qqbot-badge { font-size: 10px; padding: 1px 6px; border-radius: 999px;
  border: 0.5px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
.qqbot-switch { appearance: none; display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 11px;
  padding: 3px 9px; border-radius: 999px; border: 0.5px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); cursor: pointer; white-space: nowrap; }
.qqbot-switch[aria-checked="true"] { color: var(--dsw-alias-state-success-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, var(--dsw-alias-border-l1));
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, var(--dsw-alias-bg-layer-2)); }
.qqbot-switch:disabled { opacity: .55; cursor: default; }
.qqbot-switch-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.qqbot-feature-status { display: flex; flex-direction: column; gap: 5px;
  border-top: 0.5px dashed var(--dsw-alias-border-l1); padding-top: 9px; }
.qqbot-note { margin: 0; font-size: 11.5px; color: var(--dsw-alias-label-tertiary); line-height: 1.6;
  padding: 12px 14px; border-radius: 12px; border: 0.5px dashed var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 70%, transparent); }

.qqbot-pre { margin: 0; padding: 14px 16px; border-radius: 12px;
  border: 0.5px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
  max-height: 480px; overflow: auto; }
.qqbot-foot { display: flex; flex-wrap: wrap; gap: 14px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }

.qqbot-form { display: flex; flex-direction: column; gap: 12px; }
.qqbot-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.qqbot-field-label { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--dsw-alias-label-tertiary); }
.qqbot-field .qqbot-input, .qqbot-field .qqbot-select, .qqbot-field .qqbot-area {
  width: 100%; flex: 0 0 auto; box-sizing: border-box; }
.qqbot-select { font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2); border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: 9px; padding: 7px 9px; }
.qqbot-select:focus, .qqbot-area:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.qqbot-area { font: inherit; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2); border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: 9px; padding: 8px 10px; min-height: 76px; resize: vertical; }
.qqbot-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.qqbot-chip { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px;
  padding: 2px 8px; border-radius: 999px; border: 0.5px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); }
.qqbot-check-block { align-items: flex-start; }

.qqbot-access-section { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.qqbot-access-section-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end;
  justify-content: space-between; }
.qqbot-access-section-head .qqbot-field { flex: 0 1 220px; }
.qqbot-access-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.qqbot-access-tools .qqbot-input { flex: 1 1 220px; min-width: 160px; }
.qqbot-contact-list { display: flex; flex-direction: column; gap: 2px;
  border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 5px;
  background: var(--dsw-alias-bg-base); max-height: 260px; overflow: auto; }
.qqbot-contact-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px;
  border-radius: 8px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.qqbot-contact-row:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent); }
.qqbot-contact-row input[type="checkbox"] { accent-color: var(--dsw-alias-brand-primary); flex: none; }
.qqbot-contact-row input[type="checkbox"]:disabled { opacity: .45; }
.qqbot-contact-row:has(input:disabled) { cursor: default; opacity: .7; }
.qqbot-contact-name { color: var(--dsw-alias-label-primary); min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.qqbot-contact-id { color: var(--dsw-alias-label-tertiary); flex: none; }
.qqbot-contact-meta { color: var(--dsw-alias-label-tertiary); flex: none; font-size: 10.5px; }
.qqbot-contact-extra { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 6%, transparent);
  cursor: default; }
.qqbot-contact-extra .qqbot-contact-id { margin-right: auto; }
.qqbot-contact-empty { padding: 14px; text-align: center; font-size: 11.5px;
  color: var(--dsw-alias-label-tertiary); }
.qqbot-badge-warn { color: var(--dsw-alias-state-warn-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, var(--dsw-alias-border-l1)); }

.qqbot-login-card { align-items: stretch; }
.qqbot-login-qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 4px 0; }
/* A QR code needs a light quiet zone to stay scannable in dark mode. */
.qqbot-login-qr { display: block; width: 240px; height: 240px; border-radius: 12px; padding: 8px;
  background: #fff; border: 0.5px solid var(--dsw-alias-border-l1); object-fit: contain; }
.qqbot-login-qr-missing { display: flex; flex-direction: column; align-items: center; gap: 8px;
  width: 240px; padding: 18px; border: 0.5px dashed var(--dsw-alias-border-l1); border-radius: 12px; }
.qqbot-login-empty { width: 240px; max-width: 100%; align-self: center; }

.qqbot-message-list { display: flex; flex-direction: column; gap: 6px; max-height: 540px; overflow-y: auto; }
.qqbot-message-row { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px;
  border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 10px;
  background: var(--dsw-alias-bg-base); min-width: 0; }
.qqbot-message-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  font-size: 10.5px; color: var(--dsw-alias-label-tertiary); }
.qqbot-message-direction { display: inline-flex; align-items: center; padding: 1px 7px;
  border-radius: 999px; font-size: 10px; border: 0.5px solid transparent; }
.qqbot-message-in { color: var(--dsw-alias-state-success-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); }
.qqbot-message-out { color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.qqbot-message-time { font-variant-numeric: tabular-nums; }
.qqbot-message-source { color: var(--dsw-alias-label-secondary); font-weight: 500; }
.qqbot-message-sender { color: var(--dsw-alias-label-secondary); }
.qqbot-message-content { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-primary);
  white-space: pre-wrap; overflow-wrap: anywhere; }

.qqbot-setup-summary { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 11.5px; line-height: 1.5; }
.qqbot-setup-item { display: inline-flex; align-items: baseline; gap: 5px; min-width: 0; }
.qqbot-setup-label { color: var(--dsw-alias-label-tertiary); flex: none; }
.qqbot-setup-value { color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.qqbot-setup-logs { max-height: 220px; font-size: 11px; }
.qqbot-setup-steps { display: flex; flex-direction: column; gap: 4px; }
.qqbot-setup-step { display: flex; align-items: baseline; gap: 8px; font-size: 11.5px; line-height: 1.5; }
.qqbot-setup-step-icon { flex: none; width: 14px; text-align: center; font-weight: 500; }
.qqbot-setup-step.is-ok .qqbot-setup-step-icon { color: var(--dsw-alias-state-success-primary); }
.qqbot-setup-step.is-bad .qqbot-setup-step-icon { color: var(--dsw-alias-state-error-primary); }
.qqbot-setup-step.is-skip .qqbot-setup-step-icon { color: var(--dsw-alias-label-tertiary); }
.qqbot-setup-step-name { flex: none; color: var(--dsw-alias-label-primary); }
.qqbot-setup-step-message { color: var(--dsw-alias-label-tertiary); min-width: 0; overflow-wrap: anywhere; }

.qqbot-ai-status { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.qqbot-ai-state { font-size: 12px; font-weight: 500; }
.qqbot-ai-state.is-ok { color: var(--dsw-alias-state-success-primary); }
.qqbot-ai-state.is-bad { color: var(--dsw-alias-state-warn-primary); }
.qqbot-ai-reply-wrap { display: flex; flex-direction: column; gap: 6px; }
.qqbot-ai-reply { max-height: 220px; }

.qqbot-persona-examples { display: flex; flex-direction: column; gap: 8px; }
.qqbot-persona-example { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 12px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 70%, transparent); }
.qqbot-persona-example-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.qqbot-persona-example-head .qqbot-btn { font-size: 11px; padding: 3px 9px; }
.qqbot-persona-area { min-height: 60px; }
.qqbot-persona-preview-wrap { display: flex; flex-direction: column; gap: 6px; }
.qqbot-persona-preview-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.qqbot-persona-preview { max-height: 240px; }

.qqbot-ai-settings-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.qqbot-profiles-layout { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr); gap: 14px; align-items: start; }
.qqbot-profile-list { display: flex; flex-direction: column; gap: 6px; max-height: 420px; overflow-y: auto; }
.qqbot-profile-item { appearance: none; font: inherit; text-align: left; display: flex; flex-direction: column; gap: 3px;
  padding: 8px 10px; border-radius: 10px; border: 0.5px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); cursor: pointer; min-width: 0; }
.qqbot-profile-item:hover { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l1)); }
.qqbot-profile-item[data-active="true"] { border-color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, var(--dsw-alias-bg-base)); }
.qqbot-profile-item-top { display: flex; align-items: baseline; gap: 8px; justify-content: space-between; min-width: 0; }
.qqbot-profile-name { font-size: 12.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qqbot-profile-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 10.5px; color: var(--dsw-alias-label-tertiary); }
.qqbot-profile-summary { font-size: 11px; color: var(--dsw-alias-label-tertiary); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.qqbot-profile-editor { display: flex; flex-direction: column; gap: 10px; min-width: 0; }

.qqbot-persona-presets { display: flex; flex-direction: column; gap: 8px; border-top: 0.5px dashed var(--dsw-alias-border-l1);
  padding-top: 10px; margin-top: 2px; }
.qqbot-persona-presets-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.qqbot-persona-presets-bar .qqbot-input { flex: 1 1 220px; }
.qqbot-persona-preset-list { display: flex; flex-direction: column; gap: 6px; }
.qqbot-persona-preset-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 10px; padding: 7px 10px; border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 10px;
  background: var(--dsw-alias-bg-base); }
.qqbot-persona-preset-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.qqbot-persona-preset-name { font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qqbot-persona-preset-role { font-size: 10.5px; color: var(--dsw-alias-label-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qqbot-persona-preset-row .qqbot-btns { flex: none; }

.qqbot-full-prompt-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 11.5px;
  color: var(--dsw-alias-label-secondary); }
.qqbot-full-prompt-meta span { color: var(--dsw-alias-label-secondary); }
.qqbot-full-prompt-system { max-height: 360px; min-height: 60px; }
.qqbot-full-prompt-messages { display: flex; flex-direction: column; gap: 6px; }
.qqbot-full-prompt-message { border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 10px;
  padding: 8px 10px; background: var(--dsw-alias-bg-base); }
.qqbot-full-prompt-message-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.qqbot-full-prompt-message-text { font-size: 12px; line-height: 1.6; white-space: pre-wrap;
  overflow-wrap: anywhere; color: var(--dsw-alias-label-primary); }

@media (max-width: 860px) {
  .qqbot-ai-settings-grid { grid-template-columns: minmax(0, 1fr); }
  .qqbot-profiles-layout { grid-template-columns: minmax(0, 1fr); }
  .qqbot-grid { grid-template-columns: minmax(0, 1fr); }
  .qqbot-hero { flex-direction: column; }
  .qqbot-hero-side { align-items: flex-start; }
  .qqbot-pills { justify-content: flex-start; }
}
@media (max-width: 620px) {
  .qqbot-page { padding: 16px 14px 44px; }
  .qqbot-title { font-size: 21px; }
}

/* ── Group AI dashboard ───────────────────────────────────────────── */
.qqbot-ai-dashboard { display: flex; flex-direction: column; gap: 14px; }
.qqbot-ai-hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; padding: 4px 2px 2px; }
.qqbot-ai-eyebrow, .qqbot-ai-card-kicker { color: var(--dsw-alias-brand-primary); font-size: 10px; font-weight: 700; letter-spacing: .14em; }
.qqbot-ai-hero h1 { margin: 5px 0 4px; font-size: 27px; line-height: 1.15; letter-spacing: -.03em; color: var(--dsw-alias-label-primary); }
.qqbot-ai-hero p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12.5px; }
.qqbot-ai-hero-actions { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; justify-content: flex-end; }
.qqbot-ai-btn { border: .5px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: 9px; padding: 7px 11px; font-size: 11.5px; cursor: pointer; }
.qqbot-ai-btn:hover { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.qqbot-ai-btn-primary { background: var(--dsw-alias-brand-primary); color: #fff; border-color: transparent; }
.qqbot-ai-btn-primary:hover { color: #fff; opacity: .9; }
.qqbot-ai-pill { display: inline-flex; align-items: center; gap: 5px; border: .5px solid var(--dsw-alias-border-l1); border-radius: 999px; padding: 4px 8px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.qqbot-ai-pill-ok { color: var(--dsw-alias-state-success-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, var(--dsw-alias-border-l1)); }
.qqbot-ai-pill-run { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, var(--dsw-alias-border-l1)); }
.qqbot-ai-pill-violet { color: #7c3aed; border-color: #c4b5fd; }
.qqbot-ai-dot { width: 5px; height: 5px; border-radius: 999px; background: currentColor; }
.qqbot-ai-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.qqbot-ai-metric { display: flex; flex-direction: column; gap: 3px; padding: 13px 14px; border: .5px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); position: relative; overflow: hidden; }
.qqbot-ai-metric::after { content: ''; position: absolute; right: -18px; bottom: -22px; width: 62px; height: 62px; border-radius: 50%; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); }
.qqbot-ai-metric-label { color: var(--dsw-alias-label-tertiary); font-size: 10.5px; }
.qqbot-ai-metric-value { color: var(--dsw-alias-label-primary); font-size: 25px; line-height: 1.1; letter-spacing: -.04em; }
.qqbot-ai-metric-hint { color: var(--dsw-alias-label-tertiary); font-size: 10px; }
.qqbot-ai-card { border: .5px solid var(--dsw-alias-border-l1); border-radius: 16px; background: var(--dsw-alias-bg-layer-1); padding: 15px 16px; box-shadow: 0 8px 24px rgba(15,23,42,.035); }
.qqbot-ai-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 11px; }
.qqbot-ai-card-head h2 { margin: 3px 0 0; font-size: 14px; color: var(--dsw-alias-label-primary); }
.qqbot-ai-card-sub { color: var(--dsw-alias-label-tertiary); font-size: 10.5px; }
.qqbot-ai-main-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(260px, .85fr); gap: 14px; }
.qqbot-ai-lower-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
.qqbot-ai-machine { display: flex; align-items: flex-start; gap: 5px; flex-wrap: wrap; padding: 9px 0 5px; }
.qqbot-ai-machine-node { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 92px; padding: 8px 7px; border-radius: 10px; border: .5px dashed var(--dsw-alias-border-l1); color: var(--dsw-alias-label-tertiary); font-size: 9.5px; letter-spacing: .04em; }
.qqbot-ai-machine-node.is-reached { border-style: solid; border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l1)); color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent); }
.qqbot-ai-machine-node.is-active { box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 15%, transparent); }
.qqbot-ai-machine-index { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; opacity: .65; }
.qqbot-ai-machine-caption { color: var(--dsw-alias-label-tertiary); font-size: 10px; margin-left: auto; align-self: center; }
.qqbot-ai-active-group { display: flex; flex-direction: column; gap: 7px; margin-top: 8px; padding: 10px 11px; border-radius: 10px; background: var(--dsw-alias-bg-base); border: .5px solid var(--dsw-alias-border-l1); }
.qqbot-ai-active-title { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.qqbot-ai-active-title strong { font-size: 12px; color: var(--dsw-alias-label-primary); }
.qqbot-ai-active-title span { font-size: 10px; color: var(--dsw-alias-label-tertiary); }
.qqbot-ai-active-queue { display: flex; gap: 10px; flex-wrap: wrap; color: var(--dsw-alias-label-tertiary); font-size: 9.5px; }
.qqbot-ai-identity { margin: 0 0 12px; color: var(--dsw-alias-label-secondary); font-size: 11.5px; line-height: 1.6; }
.qqbot-ai-voice { margin: 9px 0 0; color: var(--dsw-alias-label-tertiary); font-size: 10px; }
.qqbot-ai-emotions { display: flex; flex-direction: column; gap: 7px; }
.qqbot-ai-emotion-row { display: flex; flex-direction: column; gap: 3px; }
.qqbot-ai-emotion-head { display: flex; justify-content: space-between; font-size: 10px; color: var(--dsw-alias-label-secondary); }
.qqbot-ai-meter { height: 5px; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 16%, transparent); }
.qqbot-ai-meter-fill { display: block; height: 100%; border-radius: inherit; background: var(--dsw-alias-brand-primary); }
.qqbot-ai-meter-fill.is-rose { background: #f43f5e; }.qqbot-ai-meter-fill.is-amber { background: #f59e0b; }.qqbot-ai-meter-fill.is-violet { background: #8b5cf6; }
.qqbot-ai-groups { display: flex; flex-direction: column; gap: 6px; }
.qqbot-ai-group-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; text-align: left; padding: 9px 10px; border-radius: 10px; border: .5px solid transparent; background: transparent; color: inherit; cursor: pointer; }
.qqbot-ai-group-row:hover, .qqbot-ai-group-row.is-selected { border-color: var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); }
.qqbot-ai-group-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.qqbot-ai-group-title { display: flex; align-items: center; gap: 7px; }
.qqbot-ai-group-id { color: var(--dsw-alias-label-primary); font-size: 11.5px; font-weight: 600; }
.qqbot-ai-group-meta { display: flex; gap: 9px; flex-wrap: wrap; color: var(--dsw-alias-label-tertiary); font-size: 9.5px; }
.qqbot-ai-group-arrow, .qqbot-ai-loop-arrow { color: var(--dsw-alias-label-tertiary); font-size: 18px; line-height: 1; }
.qqbot-ai-tabs { display: inline-flex; gap: 3px; padding: 2px; border-radius: 7px; background: var(--dsw-alias-bg-base); }
.qqbot-ai-tab { border: 0; background: transparent; border-radius: 5px; padding: 4px 7px; font-size: 9.5px; color: var(--dsw-alias-label-tertiary); cursor: pointer; }
.qqbot-ai-tab.is-active { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: 0 1px 3px rgba(15,23,42,.08); }
.qqbot-ai-loops { display: flex; flex-direction: column; gap: 6px; }
.qqbot-ai-loop { border: .5px solid var(--dsw-alias-border-l1); border-radius: 10px; overflow: hidden; }
.qqbot-ai-loop-head { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; border: 0; background: transparent; padding: 8px 9px; color: inherit; cursor: pointer; }
.qqbot-ai-loop-head:hover { background: var(--dsw-alias-bg-base); }
.qqbot-ai-loop-icon { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 6px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); color: var(--dsw-alias-brand-primary); font-size: 11px; flex: none; }
.qqbot-ai-loop-icon.is-idle { color: var(--dsw-alias-label-tertiary); background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 9%, transparent); }
.qqbot-ai-loop-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.qqbot-ai-loop-main strong { color: var(--dsw-alias-label-primary); font-size: 10.5px; }
.qqbot-ai-loop-main span { color: var(--dsw-alias-label-tertiary); font-size: 9px; }
.qqbot-ai-loop-state { font-size: 9px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
.qqbot-ai-loop-state.is-sent { color: var(--dsw-alias-state-success-primary); }
.qqbot-ai-loop-detail { padding: 0 10px 10px 38px; display: flex; flex-direction: column; gap: 6px; }
.qqbot-ai-loop-reply { font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.5; white-space: pre-wrap; }
.qqbot-ai-loop-meta { display: flex; gap: 9px; flex-wrap: wrap; color: var(--dsw-alias-label-tertiary); font-size: 9px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.qqbot-ai-memories { display: flex; flex-direction: column; gap: 7px; }
.qqbot-ai-memory { display: flex; gap: 8px; align-items: flex-start; }
.qqbot-ai-memory-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--dsw-alias-brand-primary); margin-top: 6px; flex: none; }
.qqbot-ai-memory-dot.is-high { background: #f59e0b; }.qqbot-ai-memory-dot.is-low { background: var(--dsw-alias-label-tertiary); }
.qqbot-ai-memory p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 10.5px; line-height: 1.5; }
.qqbot-ai-memory span { color: var(--dsw-alias-label-tertiary); font-size: 9px; }
.qqbot-ai-empty-line { color: var(--dsw-alias-label-tertiary); font-size: 11px; margin: 4px 0; }
.qqbot-ai-footer { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; color: var(--dsw-alias-label-tertiary); font-size: 9.5px; padding: 0 2px; }
.qqbot-ai-skeleton, .qqbot-ai-error-card { min-height: 150px; display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.qqbot-ai-error-card { flex-direction: column; gap: 8px; }
.qqbot-ai-error-card h2 { margin: 0; color: var(--dsw-alias-label-primary); font-size: 16px; }
@media (max-width: 900px) { .qqbot-ai-metrics { grid-template-columns: repeat(2, 1fr); } .qqbot-ai-main-grid, .qqbot-ai-lower-grid { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .qqbot-ai-hero { flex-direction: column; } .qqbot-ai-hero-actions { justify-content: flex-start; } .qqbot-ai-metrics { grid-template-columns: 1fr 1fr; } .qqbot-ai-machine-node { min-width: 76px; } }
.qqbot-ai-card-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; justify-content: flex-end; }
.qqbot-ai-btn-back { padding: 4px 8px; font-size: 10px; }
.qqbot-ai-group-name-wrap { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.qqbot-ai-group-name { color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qqbot-ai-group-id { color: var(--dsw-alias-label-tertiary); font-size: 9px; font-weight: 400; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.qqbot-ai-profile-block { margin-top: 12px; border-top: .5px solid var(--dsw-alias-border-l1); padding-top: 10px; display: flex; flex-direction: column; gap: 7px; }
.qqbot-ai-profile-head { display: flex; justify-content: space-between; gap: 8px; color: var(--dsw-alias-label-tertiary); font-size: 9.5px; }
.qqbot-ai-profile { display: flex; flex-direction: column; gap: 3px; padding: 7px 8px; border-radius: 8px; background: var(--dsw-alias-bg-base); }
.qqbot-ai-profile-name { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.qqbot-ai-profile-name strong { color: var(--dsw-alias-label-primary); font-size: 10.5px; } .qqbot-ai-profile-name span { color: var(--dsw-alias-label-tertiary); font-size: 8.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.qqbot-ai-profile p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 9.5px; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.qqbot-ai-profile-tags { display: flex; gap: 4px; flex-wrap: wrap; } .qqbot-ai-profile-tags span { padding: 1px 5px; border-radius: 4px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); color: var(--dsw-alias-brand-primary); font-size: 8.5px; }
.qqbot-ai-next-trigger { color: var(--dsw-alias-brand-primary); font-weight: 600; }
.qqbot-ai-next-trigger-detail { display: flex; gap: 10px; flex-wrap: wrap; padding: 6px 8px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent); font-size: 9.5px; }
.qqbot-ai-keywords { margin-top: 12px; border-top: .5px solid var(--dsw-alias-border-l1); padding-top: 10px; display: flex; flex-direction: column; gap: 7px; }
.qqbot-ai-keyword-tags { display: flex; gap: 5px; flex-wrap: wrap; }
.qqbot-ai-keyword-tags span { padding: 3px 7px; border-radius: 6px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); color: var(--dsw-alias-brand-primary); font-size: 9px; }

.qqbot-ai-character-clickable { cursor: pointer; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
.qqbot-ai-character-clickable:hover { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 38%, var(--dsw-alias-border-l1)); box-shadow: 0 12px 30px rgba(15,23,42,.08); transform: translateY(-1px); }
.qqbot-ai-character-clickable:focus-visible { outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); outline-offset: 2px; }
.qqbot-ai-card-link { border: 0; background: transparent; color: var(--dsw-alias-brand-primary); font-size: 10px; font-weight: 600; cursor: pointer; padding: 3px 0; white-space: nowrap; }
.qqbot-ai-card-link:hover { text-decoration: underline; }
.qqbot-ai-settings { gap: 16px; }
.qqbot-ai-settings-hero { display: flex; align-items: center; gap: 15px; padding: 6px 2px 2px; flex-wrap: wrap; }
.qqbot-ai-settings-hero-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
.qqbot-ai-settings-hero-copy h1 { margin: 0; font-size: 28px; line-height: 1.1; letter-spacing: -.035em; color: var(--dsw-alias-label-primary); }
.qqbot-ai-settings-hero-copy p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.5; max-width: 820px; }
.qqbot-ai-settings-hero-meta { display: flex; align-items: center; gap: 9px; color: var(--dsw-alias-label-tertiary); font-size: 10px; flex-wrap: wrap; }
.qqbot-ai-settings-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(280px, .8fr); gap: 14px; align-items: start; }
.qqbot-ai-settings-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.qqbot-ai-settings-bottom { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
.qqbot-ai-info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.qqbot-ai-info { display: flex; flex-direction: column; gap: 3px; padding: 9px 10px; border-radius: 9px; background: var(--dsw-alias-bg-base); border: .5px solid var(--dsw-alias-border-l1); min-width: 0; }
.qqbot-ai-info.is-wide, .qqbot-ai-info.is-full { grid-column: 1 / -1; }
.qqbot-ai-info-label { color: var(--dsw-alias-label-tertiary); font-size: 9px; letter-spacing: .03em; }
.qqbot-ai-info-value { margin: 0; color: var(--dsw-alias-label-primary); font-size: 11.5px; line-height: 1.55; word-break: break-word; }
.qqbot-ai-rule-block { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; padding: 10px 11px; border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, transparent); border: .5px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, var(--dsw-alias-border-l1)); }
.qqbot-ai-rule-block > span { color: var(--dsw-alias-brand-primary); font-size: 9px; font-weight: 700; letter-spacing: .05em; }
.qqbot-ai-rule-block p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 10.5px; line-height: 1.65; }

.qqbot-ai-persona-stack { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.qqbot-ai-name-value { margin: 12px 0 4px; color: var(--dsw-alias-label-primary); font-size: 24px; font-weight: 650; letter-spacing: -.03em; word-break: break-word; }
.qqbot-ai-persona-stack { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.qqbot-ai-name-card, .qqbot-ai-setting-card { padding: 13px 14px; }
.qqbot-ai-block-head { display: flex; align-items: center; gap: 8px; min-height: 20px; }
.qqbot-ai-block-tag { color: var(--dsw-alias-brand-primary); font-size: 10px; font-weight: 700; letter-spacing: .06em; } .qqbot-ai-block-meta { color: var(--dsw-alias-label-tertiary); font-size: 10px; } .qqbot-ai-block-edit { margin-left: auto; border: 0; background: transparent; color: var(--dsw-alias-brand-primary); font-size: 10px; font-weight: 600; cursor: pointer; padding: 2px 0; }
.qqbot-ai-block-edit:hover { text-decoration: underline; } .qqbot-ai-name-value { margin: 5px 0 1px; color: var(--dsw-alias-label-primary); font-size: 17px; font-weight: 650; letter-spacing: -.02em; word-break: break-word; }
.qqbot-ai-setting-list { display: flex; flex-direction: column; gap: 3px; margin-top: 7px; }
.qqbot-ai-setting-list p { margin: 0; padding-left: 11px; position: relative; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.55; } .qqbot-ai-setting-list p::before { content: '·'; position: absolute; left: 1px; color: var(--dsw-alias-brand-primary); font-weight: 700; }
.qqbot-ai-persona-editor { display: flex; flex-direction: column; gap: 11px; margin-top: 10px; }
.qqbot-ai-persona-field { display: flex; flex-direction: column; gap: 5px; }
.qqbot-ai-persona-field > span { color: var(--dsw-alias-brand-primary); font-size: 9px; font-weight: 700; letter-spacing: .05em; }
.qqbot-ai-input, .qqbot-ai-textarea { width: 100%; box-sizing: border-box; border: .5px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 11.5px; padding: 8px 10px; outline: none; }
.qqbot-ai-textarea { resize: vertical; min-height: 170px; line-height: 1.6; }
.qqbot-ai-input:focus, .qqbot-ai-textarea:focus { border-color: var(--dsw-alias-brand-primary); }
.qqbot-ai-persona-actions { display: flex; align-items: center; gap: 8px; margin-top: 11px; flex-wrap: wrap; }
.qqbot-ai-persona-error { margin: 9px 0 0; color: var(--dsw-alias-label-danger, #b42318); font-size: 10.5px; }
.qqbot-ai-persona-saved { margin: 9px 0 0; color: var(--dsw-alias-brand-primary); font-size: 10.5px; }
.qqbot-ai-settings-keywords { margin-top: 11px; padding-top: 10px; border-top: .5px solid var(--dsw-alias-border-l1); display: flex; flex-direction: column; gap: 7px; }
.qqbot-ai-examples { margin-top: 11px; padding-top: 10px; border-top: .5px solid var(--dsw-alias-border-l1); display: flex; flex-direction: column; gap: 7px; }
.qqbot-ai-example { display: flex; flex-direction: column; gap: 4px; padding: 8px 9px; border-radius: 8px; background: var(--dsw-alias-bg-base); }
.qqbot-ai-example-line { display: flex; gap: 7px; align-items: flex-start; }
.qqbot-ai-example-line > span { color: var(--dsw-alias-label-tertiary); font-size: 8.5px; width: 22px; flex: none; padding-top: 2px; }
.qqbot-ai-example-line p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 1.5; }
.qqbot-ai-example-line.is-assistant p { color: var(--dsw-alias-label-primary); }
.qqbot-ai-emotion-numbers { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 9px; }
.qqbot-ai-emotion-numbers span { padding: 2px 5px; border-radius: 4px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-tertiary); font-size: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.qqbot-ai-settings-profiles { display: flex; flex-direction: column; gap: 7px; }
.qqbot-ai-profile-full { padding: 9px 10px; gap: 5px; }
.qqbot-ai-profile-full p { -webkit-line-clamp: 4; font-size: 10px; }
.qqbot-ai-profile-facts { display: flex; gap: 5px; flex-wrap: wrap; }
.qqbot-ai-profile-facts span { color: var(--dsw-alias-label-tertiary); font-size: 8.5px; }
.qqbot-ai-settings-memories { display: flex; flex-direction: column; gap: 8px; max-height: 420px; overflow-y: auto; padding-right: 4px; }
.qqbot-ai-settings-groups { display: flex; flex-direction: column; gap: 7px; }
.qqbot-ai-settings-group { padding: 9px 10px; border-radius: 9px; background: var(--dsw-alias-bg-base); border: .5px solid var(--dsw-alias-border-l1); display: flex; flex-direction: column; gap: 4px; }
.qqbot-ai-settings-group-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.qqbot-ai-settings-group-head strong { color: var(--dsw-alias-label-primary); font-size: 10.5px; }
.qqbot-ai-settings-group-head span { color: var(--dsw-alias-label-tertiary); font-size: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.qqbot-ai-settings-group p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 9.5px; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
@media (max-width: 900px) { .qqbot-ai-settings-grid, .qqbot-ai-settings-bottom { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .qqbot-ai-settings-hero { align-items: flex-start; flex-direction: column; } .qqbot-ai-info-grid { grid-template-columns: 1fr; } .qqbot-ai-info.is-wide, .qqbot-ai-info.is-full { grid-column: auto; } }
.qqbot-game-card { appearance: none; text-align: left; cursor: pointer; color: inherit; font: inherit; }
.qqbot-game-card:hover { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l1)); }
.qqbot-admin-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.qqbot-admin-stats-wide { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.qqbot-admin-stat { display: flex; flex-direction: column; gap: 3px; padding: 9px 11px; border-radius: 11px;
  background: var(--dsw-alias-bg-layer-2); border: 0.5px solid var(--dsw-alias-border-l1); min-width: 0; }
.qqbot-admin-stat-label { font-size: 10px; color: var(--dsw-alias-label-tertiary); }
.qqbot-admin-stat-value { font-size: 15px; font-weight: 500; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.qqbot-admin-up { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 10px; align-items: end; }
.qqbot-table-wrap { overflow-x: auto; border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 12px; }
.qqbot-table-wrap .qqbot-table { min-width: 820px; }
@media (max-width: 900px) {
  .qqbot-admin-stats-wide { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .qqbot-admin-up { grid-template-columns: minmax(0, 1fr); }
}


${TOKEN_CSS}
`
