import { STEPS, emptyProfile, buildContext } from './schema.js';
import { buildManual, evalExpr, getPath } from './engine.js';
import { POLICIES } from '../content/index.js';
import { esc, policyHtml, manualHtml } from './render-html.js';
import { exportManualDocx, exportPolicyDocx, safeName } from './export-docx.js';
import { fullProfile } from './samples.js';

// ---- storage ----------------------------------------------------------------
// Per-browser storage for now; every read/write is guarded so the app still
// works (in memory) when storage is blocked.

const KEY = 'pb.agencies.v1';
const CUR = 'pb.current.v1';
let agencies = {};
let currentId = null;

function load() {
  try { agencies = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { agencies = {}; }
  try { currentId = localStorage.getItem(CUR); } catch { currentId = null; }
  if (!agencies[currentId]) currentId = Object.keys(agencies)[0] || null;
  if (!currentId) currentId = createAgency(emptyProfile());
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(agencies));
    localStorage.setItem(CUR, currentId);
  } catch { /* storage unavailable: keep working in memory */ }
}
function createAgency(profile) {
  const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  agencies[id] = { id, profile, updatedAt: new Date().toISOString() };
  currentId = id;
  persist();
  return id;
}
const profile = () => agencies[currentId].profile;

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  keys.slice(0, -1).forEach(k => { if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; });
  cur[keys[keys.length - 1]] = value;
}

let saveTimer;
function changed() {
  agencies[currentId].updatedAt = new Date().toISOString();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persist();
    renderAgencySelect();
    renderNav();
    const note = document.querySelector('.saved-note');
    if (note) note.textContent = 'All changes saved in this browser';
  }, 300);
}

// ---- helpers ----------------------------------------------------------------

const $ = (sel, root = document) => root.querySelector(sel);
const main = () => $('#main');

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

const allFields = step => step.fields || (step.groups || []).flatMap(g => g.fields);
const FIELD_INDEX = Object.fromEntries(STEPS.flatMap(s => allFields(s).map(f => [f.path, { ...f, step: s }])));

function isAnswered(f, p) {
  const v = getPath(p, f.path);
  if (f.type === 'checkbox') return true;
  if (Array.isArray(v)) return v.length > 0;
  return v != null && String(v).trim() !== '';
}

function stepStatus(step, p) {
  const ctx = buildContext(p);
  const req = allFields(step).filter(f => f.required && (!f.showIf || evalExpr(f.showIf, ctx)));
  if (!req.length) {
    const any = allFields(step).some(f => f.type !== 'checkbox' && isAnswered(f, p));
    return any ? 'done' : 'none';
  }
  const n = req.filter(f => isAnswered(f, p)).length;
  return n === req.length ? 'done' : n ? 'partial' : 'none';
}

// ---- routing ----------------------------------------------------------------

function route() {
  const [, kind = 'step', arg = STEPS[0].id] = (location.hash || '').split('/');
  return { kind, arg: decodeURIComponent(arg) };
}
const go = hash => { location.hash = hash; };

// ---- chrome -----------------------------------------------------------------

function renderAgencySelect() {
  const sel = $('#agencySelect');
  sel.innerHTML = Object.values(agencies)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .map(a => `<option value="${a.id}" ${a.id === currentId ? 'selected' : ''}>${esc(a.profile.agency?.legalName || 'Untitled agency')}</option>`)
    .join('');
}

function renderNav() {
  const p = profile();
  const r = route();
  const link = (hash, label, dot, current) =>
    `<button type="button" class="step-link" data-go="${hash}" ${current ? 'aria-current="page"' : ''}>${dot}<span>${esc(label)}</span></button>`;
  let html = '<h3>Agency intake</h3>';
  STEPS.forEach((s, i) => {
    const st = stepStatus(s, p);
    const dot = `<span class="step-dot ${st}">${st === 'done' ? '&#10003;' : i + 1}</span>`;
    html += link(`#/step/${s.id}`, s.title, dot, r.kind === 'step' && r.arg === s.id);
  });
  html += '<h3>Manual</h3>';
  html += link('#/review', 'Review policies', '<span class="step-dot">&#9776;</span>', r.kind === 'review');
  html += link('#/export', 'Export', '<span class="step-dot">&#8681;</span>', r.kind === 'export');
  $('#stepNav').innerHTML = html;
}

// ---- intake forms -----------------------------------------------------------

function fieldHtml(f, p, ctx) {
  if (f.showIf && !evalExpr(f.showIf, ctx)) return '';
  const id = 'f_' + f.path.replace(/\W/g, '_');
  const v = getPath(p, f.path);
  const req = f.required ? '<span class="req" aria-hidden="true">*</span>' : '';
  const help = f.help ? `<div class="help">${esc(f.help)}</div>` : '';
  const ph = f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '';
  const cls = `field${f.half ? ' half' : ''}`;
  const data = `data-path="${esc(f.path)}" data-type="${f.type}"`;
  switch (f.type) {
    case 'textarea':
      return `<div class="${cls}"><label for="${id}">${esc(f.label)}${req}</label><textarea id="${id}" ${data} ${ph}>${esc(v || '')}</textarea>${help}</div>`;
    case 'list':
      return `<div class="${cls}"><label for="${id}">${esc(f.label)}${req}</label><textarea id="${id}" ${data} ${ph}>${esc((v || []).join('\n'))}</textarea>${help}</div>`;
    case 'select':
      return `<div class="${cls}"><label for="${id}">${esc(f.label)}${req}</label><select id="${id}" ${data}>
        ${f.required ? '' : '<option value="">Select...</option>'}
        ${f.options.map(([val, lab]) => `<option value="${esc(val)}" ${v === val ? 'selected' : ''}>${esc(lab)}</option>`).join('')}
      </select>${help}</div>`;
    case 'checkbox':
      return `<div class="${cls}"><label class="check"><input type="checkbox" id="${id}" ${data} ${v ? 'checked' : ''}> ${esc(f.label)}</label>${help}</div>`;
    case 'multi':
      return `<div class="${cls}"><div class="label" id="${id}">${esc(f.label)}${req}</div><div class="chips" role="group" aria-labelledby="${id}">
        ${f.options.map(([val, lab]) => `<label class="chip"><input type="checkbox" ${data} value="${esc(val)}" ${(v || []).includes(val) ? 'checked' : ''}><span>${esc(lab)}</span></label>`).join('')}
      </div>${help}</div>`;
    case 'repeat': {
      const items = Array.isArray(v) ? v : [];
      return `<div class="${cls}">${items.map((item, i) => `
        <div class="repeat-item">
          <div class="row-head"><span>${esc(f.itemLabel)} ${i + 1}</span>${items.length > 1 ? `<button type="button" class="link-btn danger" data-remove="${esc(f.path)}" data-index="${i}">Remove</button>` : ''}</div>
          ${f.itemFields.map(sf => `<div class="field"><label for="${id}_${i}_${sf.key}">${esc(sf.label)}</label>
            <input type="text" id="${id}_${i}_${sf.key}" data-repeat="${esc(f.path)}" data-index="${i}" data-key="${sf.key}" value="${esc(item[sf.key] || '')}"></div>`).join('')}
        </div>`).join('')}
        <button type="button" class="btn ghost" data-add="${esc(f.path)}">Add ${esc(f.itemLabel.toLowerCase())}</button></div>`;
    }
    default:
      return `<div class="${cls}"><label for="${id}">${esc(f.label)}${req}</label><input type="${f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}" id="${id}" ${data} ${ph} value="${esc(v ?? '')}">${help}</div>`;
  }
}

function renderStep(stepId) {
  const idx = Math.max(0, STEPS.findIndex(s => s.id === stepId));
  const step = STEPS[idx];
  const p = profile();
  const ctx = buildContext(p);
  let body;
  if (step.groups) {
    body = `<div class="role-grid">${step.groups.map(g => `<div class="role-card"><h3>${esc(g.label)}</h3>${g.fields.map(f => fieldHtml(f, p, ctx)).join('')}</div>`).join('')}</div>`;
  } else {
    body = `<div class="form-grid">${step.fields.map(f => fieldHtml(f, p, ctx)).join('')}</div>`;
  }
  const prev = STEPS[idx - 1];
  const next = STEPS[idx + 1];
  main().innerHTML = `
    <div class="page-head"><div><h1>${esc(step.title)}</h1><p>${esc(step.intro || '')}</p></div><span class="saved-note">All changes saved in this browser</span></div>
    <form class="card" id="stepForm" onsubmit="return false">${body}</form>
    <div class="form-nav">
      ${prev ? `<button type="button" class="btn ghost" data-go="#/step/${prev.id}">Back: ${esc(prev.title)}</button>` : '<span></span>'}
      ${next ? `<button type="button" class="btn" data-go="#/step/${next.id}">Next: ${esc(next.title)}</button>` : '<button type="button" class="btn" data-go="#/review">Review policies</button>'}
    </div>`;
}

function onFormInput(e) {
  const el = e.target;
  const p = profile();
  if (el.dataset.repeat) {
    const list = getPath(p, el.dataset.repeat);
    list[Number(el.dataset.index)][el.dataset.key] = el.value;
    return changed();
  }
  const path = el.dataset.path;
  if (!path) return;
  const type = el.dataset.type;
  let value;
  if (type === 'checkbox') value = el.checked;
  else if (type === 'multi') value = [...document.querySelectorAll(`input[data-path="${CSS.escape(path)}"]:checked`)].map(i => i.value);
  else if (type === 'list') value = el.value.split('\n').map(s => s.trim()).filter(Boolean);
  else if (type === 'number') value = el.value === '' ? '' : Number(el.value);
  else value = el.value;
  setPath(p, path, value);
  changed();
  // Re-render when a field controls the visibility of others.
  const controls = STEPS.some(s => allFields(s).some(f => f.showIf && f.showIf.includes(path)));
  if (controls && (type === 'checkbox' || type === 'multi' || type === 'select')) {
    const focusId = el.id;
    renderStep(route().arg);
    const again = document.getElementById(focusId) || document.querySelector(`[data-path="${CSS.escape(path)}"][value="${CSS.escape(el.value)}"]`);
    if (again) again.focus();
  }
}

// ---- review -----------------------------------------------------------------

function gapLinks(missing) {
  return missing.map(path => {
    const f = FIELD_INDEX[path];
    return f
      ? `<li><button type="button" class="link-btn" data-go="#/step/${f.step.id}">${esc(f.step.title)}: ${esc(f.label)}</button></li>`
      : `<li>${esc(path)}</li>`;
  }).join('');
}

function renderReview(selectedId) {
  const ctx = buildContext(profile());
  if (!ctx.program.manuals.length) {
    main().innerHTML = `<div class="page-head"><div><h1>Review policies</h1></div></div>
      <div class="card empty"><p>Choose at least one standards manual on the Programs step to build the manual.</p>
      <button type="button" class="btn" data-go="#/step/programs">Go to Programs</button></div>`;
    return;
  }
  const manual = buildManual(POLICIES, ctx);
  const sel = manual.included.find(r => r.policy.id === selectedId) || manual.included[0];
  const sections = [['ASPIRE', 'Section 1: ASPIRE to Excellence'], ['PROGRAM', 'Section 2: Program Standards']];
  const listHtml = sections.map(([code, label]) => {
    const inc = manual.included.filter(r => r.policy.section === code);
    const exc = manual.excluded.filter(p => p.section === code);
    if (!inc.length && !exc.length) return '';
    return `<h4>${esc(label)}</h4>
      ${inc.map(r => `<button type="button" class="pl-item" data-go="#/review/${r.policy.id}" ${sel && r.policy.id === sel.policy.id ? 'aria-current="true"' : ''}>
        <span class="num">${esc(r.policy.number)}</span><span class="t">${esc(r.policy.title)}</span>${r.missing.length ? `<span class="badge" title="Missing intake answers">${r.missing.length}</span>` : '<span></span>'}</button>`).join('')}
      ${exc.map(p => `<div class="pl-item excluded" title="Not included: does not apply to this agency"><span class="num">${esc(p.number)}</span><span class="t">${esc(p.title)}</span><span></span></div>`).join('')}`;
  }).join('');
  const words = manual.included.reduce((n, r) => n + r.blocks.reduce((m, b) => m + b.runs.reduce((k, x) => k + x.text.split(/\s+/).filter(Boolean).length, 0), 0), 0);
  main().innerHTML = `
    <div class="page-head"><div><h1>Review policies</h1><p>Every policy is generated from the intake answers. Change an answer and the text updates. Struck-out policies do not apply to this agency.</p></div>
      <button type="button" class="btn" data-go="#/export">Export manual</button></div>
    <div class="stats">
      <div class="stat"><b>${manual.included.length}</b><span>policies included</span></div>
      <div class="stat"><b>${manual.excluded.length}</b><span>not applicable</span></div>
      <div class="stat"><b>${manual.crosswalk.length}</b><span>crosswalk entries</span></div>
      <div class="stat"><b>${words.toLocaleString()}</b><span>words</span></div>
      <div class="stat"><b style="color:${manual.missing.length ? 'var(--warn)' : 'var(--ok)'}">${manual.missing.length}</b><span>intake gaps</span></div>
    </div>
    ${manual.missing.length ? `<div class="notice"><b>Some answers are missing.</b> They show highlighted in the text until filled in.<ul>${gapLinks(manual.missing)}</ul></div>` : ''}
    <div class="review">
      <nav class="policy-list" aria-label="Policies">${listHtml}</nav>
      <div>${sel ? `
        ${sel.policy.consultantNotes ? `<div class="consultant"><b>Consultant notes (not printed)</b>${esc(sel.policy.consultantNotes)}</div>` : ''}
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:10px">
          <button type="button" class="btn ghost" data-action="policy-docx" data-id="${sel.policy.id}">Download this policy (.docx)</button>
        </div>
        <article class="doc">${policyHtml(sel, ctx)}</article>` : '<div class="card empty">No policies apply yet.</div>'}
      </div>
    </div>`;
}

// ---- export -----------------------------------------------------------------

function renderExport() {
  const ctx = buildContext(profile());
  const manual = buildManual(POLICIES, ctx);
  main().innerHTML = `
    <div class="page-head"><div><h1>Export</h1><p>${manual.included.length} policies for ${esc(ctx.agency.legalName || 'this agency')}, with a cover page, approval page, contents, and standards crosswalk.</p></div></div>
    ${manual.missing.length ? `<div class="notice"><b>${manual.missing.length} intake answer(s) are still missing.</b> They will appear highlighted in the exported manual.<ul>${gapLinks(manual.missing)}</ul></div>` : ''}
    <div class="export-grid">
      <div class="card export-card"><h2>Word document</h2><p>Editable .docx with each policy on its own page. Best for final edits and agency sign-off.</p>
        <button type="button" class="btn" data-action="manual-docx" ${manual.included.length ? '' : 'disabled'}>Download .docx</button></div>
      <div class="card export-card"><h2>PDF</h2><p>Opens the print dialog with the full manual. Choose "Save as PDF" as the printer.</p>
        <button type="button" class="btn" data-action="print" ${manual.included.length ? '' : 'disabled'}>Print or save as PDF</button></div>
      <div class="card export-card"><h2>Agency file</h2><p>Saves this agency's intake answers so they can be backed up, moved to another computer, or shared with the agency.</p>
        <button type="button" class="btn ghost" data-action="json">Download agency file</button></div>
    </div>`;
}

function printManual() {
  const ctx = buildContext(profile());
  const manual = buildManual(POLICIES, ctx);
  $('#printRoot').innerHTML = manualHtml(manual, ctx);
  const prevTitle = document.title;
  document.title = `${safeName(ctx.agency.name)}-Policies-and-Procedures`;
  window.print();
  document.title = prevTitle;
}

function downloadJson() {
  const a = agencies[currentId];
  const blob = new Blob([JSON.stringify({ format: 'policy-builder-agency', version: 1, profile: a.profile }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${safeName(a.profile.agency?.legalName)}-intake.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// ---- main render + events ---------------------------------------------------

function render() {
  const r = route();
  renderNav();
  if (r.kind === 'review') renderReview(r.arg === 'step' ? null : r.arg);
  else if (r.kind === 'export') renderExport();
  else renderStep(r.arg);
}

async function onClick(e) {
  const t = e.target.closest('button, [data-go]');
  if (!t) return;
  if (t.dataset.go) { go(t.dataset.go); return; }
  const p = profile();
  if (t.dataset.add) {
    const list = getPath(p, t.dataset.add) || [];
    list.push({});
    setPath(p, t.dataset.add, list);
    changed(); render();
  } else if (t.dataset.remove) {
    getPath(p, t.dataset.remove).splice(Number(t.dataset.index), 1);
    changed(); render();
  } else if (t.dataset.action) {
    const ctx = buildContext(p);
    try {
      if (t.dataset.action === 'manual-docx') { t.disabled = true; await exportManualDocx(buildManual(POLICIES, ctx), ctx); }
      else if (t.dataset.action === 'policy-docx') {
        const r = buildManual(POLICIES, ctx).included.find(x => x.policy.id === t.dataset.id);
        if (r) await exportPolicyDocx(r, ctx);
      } else if (t.dataset.action === 'print') printManual();
      else if (t.dataset.action === 'json') downloadJson();
    } catch (err) {
      toast(err.message || 'Export failed');
      console.error(err);
    } finally { t.disabled = false; }
  }
}

function closeMenu() { const m = $('.menu'); if (m) m.open = false; }

function init() {
  load();
  renderAgencySelect();
  document.addEventListener('click', onClick);
  main().addEventListener('input', onFormInput);
  window.addEventListener('hashchange', () => { render(); main().focus({ preventScroll: true }); window.scrollTo(0, 0); });

  $('#agencySelect').addEventListener('change', e => { currentId = e.target.value; persist(); render(); });
  $('#newAgencyBtn').addEventListener('click', () => { createAgency(emptyProfile()); renderAgencySelect(); go('#/step/agency'); render(); });
  $('#sampleBtn').addEventListener('click', () => { closeMenu(); createAgency(structuredClone(fullProfile)); renderAgencySelect(); go('#/review'); render(); toast('Sample agency loaded'); });
  $('#exportJsonBtn').addEventListener('click', () => { closeMenu(); downloadJson(); });
  $('#importJsonBtn').addEventListener('click', () => { closeMenu(); $('#importFile').click(); });
  $('#importFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const prof = data.format === 'policy-builder-agency' ? data.profile : data;
      if (!prof || typeof prof !== 'object' || !prof.agency) throw new Error('Not an agency file');
      createAgency({ ...emptyProfile(), ...prof });
      renderAgencySelect(); render();
      toast(`Imported ${prof.agency.legalName || 'agency'}`);
    } catch { toast('That file is not a valid agency file.'); }
  });
  $('#deleteAgencyBtn').addEventListener('click', () => {
    closeMenu();
    const name = profile().agency?.legalName || 'this untitled agency';
    if (!confirm(`Delete ${name}? This removes its intake answers from this browser.`)) return;
    delete agencies[currentId];
    currentId = Object.keys(agencies)[0] || null;
    if (!currentId) createAgency(emptyProfile());
    persist(); renderAgencySelect(); render();
  });
  document.addEventListener('click', e => { const m = $('.menu'); if (m && m.open && !m.contains(e.target)) m.open = false; });
  render();
}

init();
