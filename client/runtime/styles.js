/**
 * Panel stylesheet: design tokens, layout, hover/focus states.
 * Kept as one module so the bundle still ships exactly one <style> element.
 */
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
`
