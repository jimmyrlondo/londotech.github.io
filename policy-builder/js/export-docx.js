// Word (.docx) export using the vendored docx library (global `docx`).
import { metaRows } from './render-html.js';

const FONT = 'Calibri';

function lib() {
  if (typeof window === 'undefined' || !window.docx) throw new Error('Word export library has not loaded yet. Try again in a moment.');
  return window.docx;
}

function runs(D, rs, extra = {}) {
  return rs.map(r => new D.TextRun({
    text: r.text,
    bold: r.bold || extra.bold,
    highlight: r.missing ? 'yellow' : undefined,
    font: FONT,
    size: extra.size,
  }));
}

function blockParas(D, blocks, numState) {
  const out = [];
  for (const b of blocks) {
    if (b.type === 'h2') out.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, children: runs(D, b.runs), spacing: { before: 280, after: 100 } }));
    else if (b.type === 'h3') out.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_3, children: runs(D, b.runs), spacing: { before: 200, after: 80 } }));
    else if (b.type === 'li') out.push(new D.Paragraph({ children: runs(D, b.runs), bullet: { level: 0 }, spacing: { after: 60 } }));
    else if (b.type === 'oli') {
      if (b.n === 1) numState.instance++;
      out.push(new D.Paragraph({ children: runs(D, b.runs), numbering: { reference: 'steps', level: 0, instance: numState.instance }, spacing: { after: 60 } }));
    } else out.push(new D.Paragraph({ children: runs(D, b.runs), spacing: { after: 140 } }));
  }
  return out;
}

const cellMargins = { top: 70, bottom: 70, left: 110, right: 110 };

function kvTable(D, rows) {
  return new D.Table({
    width: { size: 100, type: D.WidthType.PERCENTAGE },
    rows: rows.map(([k, v]) => new D.TableRow({
      children: [
        new D.TableCell({
          width: { size: 26, type: D.WidthType.PERCENTAGE },
          shading: { fill: 'EFEFEC', type: D.ShadingType.CLEAR, color: 'auto' },
          margins: cellMargins,
          children: [new D.Paragraph({ children: [new D.TextRun({ text: k, bold: true, font: FONT, size: 20 })] })],
        }),
        new D.TableCell({
          width: { size: 74, type: D.WidthType.PERCENTAGE },
          margins: cellMargins,
          children: [new D.Paragraph({ children: [new D.TextRun({ text: String(v ?? ''), font: FONT, size: 20 })] })],
        }),
      ],
    })),
  });
}

function gridTable(D, head, rows) {
  const cell = (t, bold, shade) => new D.TableCell({
    margins: cellMargins,
    shading: shade ? { fill: 'EFEFEC', type: D.ShadingType.CLEAR, color: 'auto' } : undefined,
    children: [new D.Paragraph({ children: [new D.TextRun({ text: String(t ?? ''), bold, font: FONT, size: 19 })] })],
  });
  return new D.Table({
    width: { size: 100, type: D.WidthType.PERCENTAGE },
    rows: [
      new D.TableRow({ tableHeader: true, children: head.map(h => cell(h, true, true)) }),
      ...rows.map(r => new D.TableRow({ children: r.map(t => cell(t, false, false)) })),
    ],
  });
}

function title(D, text) {
  return new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, children: [new D.TextRun({ text, font: FONT })], spacing: { after: 200 } });
}

function header(D, left) {
  return new D.Header({
    children: [new D.Paragraph({
      border: { bottom: { style: D.BorderStyle.SINGLE, size: 4, color: 'AAAAAA', space: 4 } },
      children: [new D.TextRun({ text: left, font: FONT, size: 17, color: '666666' })],
    })],
  });
}

function footer(D, ctx) {
  return new D.Footer({
    children: [new D.Paragraph({
      alignment: D.AlignmentType.RIGHT,
      children: [new D.TextRun({
        font: FONT, size: 17, color: '666666',
        children: [`${ctx.agency.name}  |  Effective ${ctx.admin.effectiveDateText || 'date not set'}  |  Page `, D.PageNumber.CURRENT],
      })],
    })],
  });
}

function policySection(D, r, ctx, numState) {
  const p = r.policy;
  return {
    properties: { page: { margin: { top: 1200, bottom: 1100, left: 1200, right: 1200 } } },
    headers: { default: header(D, `${ctx.agency.legalName}  |  ${p.number} ${p.title}`) },
    footers: { default: footer(D, ctx) },
    children: [
      title(D, `${p.number} ${p.title}`),
      kvTable(D, [['Organization', ctx.agency.legalName], ...metaRows(p, ctx)]),
      new D.Paragraph({ text: '' }),
      ...blockParas(D, r.blocks, numState),
    ],
  };
}

function makeDoc(D, ctx, sections) {
  return new D.Document({
    creator: ctx.agency.legalName,
    title: `${ctx.agency.legalName} Policies and Procedures`,
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 32, bold: true, color: '1F3A52', font: FONT } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 25, bold: true, color: '1F3A52', font: FONT } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, font: FONT } },
      ],
    },
    numbering: {
      config: [{
        reference: 'steps',
        levels: [{ level: 0, format: D.LevelFormat.DECIMAL, text: '%1.', alignment: D.AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
      }],
    },
    sections,
  });
}

async function save(D, doc, filename) {
  const blob = await D.Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export const safeName = s => String(s || 'agency').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');

export async function exportManualDocx(manual, ctx) {
  const D = lib();
  await save(D, manualDocument(D, manual, ctx), `${safeName(ctx.agency.name)}-Policies-and-Procedures.docx`);
}

// Builds the full manual as a docx Document. `D` is the docx library.
export function manualDocument(D, manual, ctx) {
  const numState = { instance: 0 };
  const sections = [];
  sections.push({
    properties: { verticalAlign: D.VerticalAlign.CENTER },
    children: [
      new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: ctx.agency.legalName, bold: true, size: 52, font: FONT })] }),
      new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { before: 200 }, children: [new D.TextRun({ text: 'Policies and Procedures Manual', size: 34, font: FONT })] }),
      new D.Paragraph({ text: '', spacing: { before: 800 } }),
      ...(ctx.program.manualNames.length ? [new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: `Prepared for accreditation under: ${ctx.program.manualNames.join(', ')}`, font: FONT })] })] : []),
      new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: `Effective ${ctx.admin.effectiveDateText || 'date not set'}`, font: FONT })] }),
      new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: `Version ${ctx.admin.version}`, font: FONT })] }),
    ],
  });
  sections.push({
    footers: { default: footer(D, ctx) },
    children: [
      title(D, 'Approval'),
      new D.Paragraph({ spacing: { after: 200 }, children: [new D.TextRun({ text: `This manual was reviewed and approved by the ${ctx.admin.approver} of ${ctx.agency.legalName.replace(/\.$/, '')}. Policies are reviewed ${ctx.admin.reviewFrequency} and whenever laws, regulations, accreditation standards, or agency operations change.`, font: FONT })] }),
      kvTable(D, [['Approved by', ctx.admin.approver], ['Signature', ''], ['Date', ''], [ctx.roles.executive.title, '']]),
      new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, spacing: { before: 400, after: 120 }, children: [new D.TextRun({ text: 'Contents', font: FONT })] }),
      gridTable(D, ['No.', 'Policy', 'Standard'], manual.included.map(r => [r.policy.number, r.policy.title, r.policy.standard])),
    ],
  });
  for (const r of manual.included) sections.push(policySection(D, r, ctx, numState));
  sections.push({
    headers: { default: header(D, `${ctx.agency.legalName}  |  Standards Crosswalk`) },
    footers: { default: footer(D, ctx) },
    children: [
      title(D, 'Standards Crosswalk'),
      new D.Paragraph({ spacing: { after: 200 }, children: [new D.TextRun({ text: 'Each row shows where this manual addresses a standards topic. Confirm section numbers against the current standards manual year.', font: FONT })] }),
      gridTable(D, ['Standard', 'Topic', 'Policy', 'Section'], manual.crosswalk.map(c => [c.standard, c.topic, `${c.number} ${c.policyTitle}`, c.heading || ''])),
    ],
  });
  return makeDoc(D, ctx, sections);
}

export async function exportPolicyDocx(rendered, ctx) {
  const D = lib();
  const doc = makeDoc(D, ctx, [policySection(D, rendered, ctx, { instance: 0 })]);
  await save(D, doc, `${safeName(ctx.agency.name)}-${rendered.policy.number}-${safeName(rendered.policy.title)}.docx`);
}
