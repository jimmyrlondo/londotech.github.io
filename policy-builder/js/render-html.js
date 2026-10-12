// Renders engine output (blocks) as HTML for on-screen preview and printing.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function runsHtml(runs) {
  return runs.map(r => {
    if (r.missing) return `<span class="gap" title="Missing intake answer">${esc(r.text)}</span>`;
    return r.bold ? `<strong>${esc(r.text)}</strong>` : esc(r.text);
  }).join('');
}

export function blocksHtml(blocks) {
  let html = '';
  let list = null;
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const b of blocks) {
    const want = b.type === 'li' ? 'ul' : b.type === 'oli' ? 'ol' : null;
    if (want !== list) { close(); if (want) { html += `<${want}>`; list = want; } }
    if (want) html += `<li>${runsHtml(b.runs)}</li>`;
    else html += `<${b.type === 'p' ? 'p' : b.type}>${runsHtml(b.runs)}</${b.type === 'p' ? 'p' : b.type}>`;
  }
  close();
  return html;
}

export function metaRows(policy, ctx) {
  return [
    ['Policy number', policy.number],
    ['Standard reference', `${policy.standard} ${policy.topic}`],
    ['Effective date', ctx.admin.effectiveDateText || 'Not set'],
    ['Review', `Reviewed ${ctx.admin.reviewFrequency}`],
    ['Approved by', ctx.admin.approver],
    ['Applies to', 'All personnel, volunteers, students, and contractors'],
  ];
}

export function policyHtml(rendered, ctx) {
  const p = rendered.policy;
  const rows = metaRows(p, ctx).map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
  return `<h1>${esc(p.number)} ${esc(p.title)}</h1>
<table class="meta"><tr><td class="k">Organization</td><td>${esc(ctx.agency.legalName)}</td></tr>${rows}</table>
${blocksHtml(rendered.blocks)}`;
}

export function crosswalkHtml(manual) {
  const rows = manual.crosswalk.map(c => `<tr><td>${esc(c.standard)}</td><td>${esc(c.topic)}</td><td>${esc(c.number)} ${esc(c.policyTitle)}</td><td>${esc(c.heading || '')}</td></tr>`).join('');
  return `<h1>Standards Crosswalk</h1>
<p>Each row shows where this manual addresses a standards topic. Confirm section numbers against the current standards manual year.</p>
<table class="grid"><thead><tr><th>Standard</th><th>Topic</th><th>Policy</th><th>Section</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function manualHtml(manual, ctx) {
  const toc = manual.included.map(r => `<tr><td>${esc(r.policy.number)}</td><td>${esc(r.policy.title)}</td><td>${esc(r.policy.standard)}</td></tr>`).join('');
  const pages = [];
  pages.push(`<div class="cover">
  <h1>${esc(ctx.agency.legalName)}</h1>
  <div class="sub">Policies and Procedures Manual</div>
  <div class="meta-line">
    ${ctx.program.manualNames.length ? `Prepared for accreditation under: ${esc(ctx.program.manualNames.join(', '))}<br>` : ''}
    Effective ${esc(ctx.admin.effectiveDateText || 'date not set')}<br>
    Version ${esc(ctx.admin.version)}
  </div>
</div>`);
  pages.push(`<h1>Approval</h1>
<p>This manual was reviewed and approved by the ${esc(ctx.admin.approver)} of ${esc(ctx.agency.legalName.replace(/\.$/, ''))}. Policies are reviewed ${esc(ctx.admin.reviewFrequency)} and whenever laws, regulations, accreditation standards, or agency operations change.</p>
<table class="meta">
<tr><td class="k">Approved by</td><td>${esc(ctx.admin.approver)}</td></tr>
<tr><td class="k">Signature</td><td>&nbsp;</td></tr>
<tr><td class="k">Date</td><td>&nbsp;</td></tr>
<tr><td class="k">${esc(ctx.roles.executive.title)}</td><td>&nbsp;</td></tr>
</table>
<h2>Contents</h2>
<table class="grid"><thead><tr><th>No.</th><th>Policy</th><th>Standard</th></tr></thead><tbody>${toc}</tbody></table>`);
  for (const r of manual.included) pages.push(policyHtml(r, ctx));
  pages.push(crosswalkHtml(manual));
  return `<div class="doc">${pages.map(p => `<section class="page">${p}</section>`).join('')}</div>`;
}
