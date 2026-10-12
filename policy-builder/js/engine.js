// Template engine: turns a policy template + an agency profile into a
// deterministic document model. Same profile in, same document out.
//
// Template syntax (see AUTHORING.md for the full guide):
//   {{agency.legalName}}                 merge field
//   {{agency.dba || "the Agency"}}       merge field with fallback
//   {{list populations.served}}          array joined as "a, b, and c"
//   {{#if expr}} ... {{else}} ... {{/if}}
//   {{#unless expr}} ... {{/unless}}
//   {{#each locations}} {{this.name}} {{/each}}
// Expressions: path, !path, path == "x" (or == other.path), path != "x", path contains "x",
// joined with " and " / " or " (and binds tighter than or).
// Block markdown: #, ##, ### headings, "- " bullets, "1. " numbered items,
// blank-line separated paragraphs, **bold** inline.

const MISSING_OPEN = '[[';
const MISSING_CLOSE = ']]';

export function getPath(ctx, path) {
  if (path === 'this') return ctx.this;
  let cur = ctx;
  for (const key of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

function isTruthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim() !== '';
  return Boolean(v);
}

function parseLiteral(s) {
  s = s.trim();
  if (/^".*"$/.test(s) || /^'.*'$/.test(s)) return s.slice(1, -1);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return undefined;
}

function evalTerm(term, ctx) {
  term = term.trim();
  let m;
  if ((m = term.match(/^(.+?)\s+contains\s+(.+)$/))) {
    const v = getPath(ctx, m[1].trim());
    const lit = parseLiteral(m[2]);
    if (Array.isArray(v)) return v.includes(lit);
    if (typeof v === 'string') return v.includes(lit);
    return false;
  }
  if ((m = term.match(/^(.+?)\s*(==|!=)\s*(.+)$/))) {
    const v = getPath(ctx, m[1].trim());
    let lit = parseLiteral(m[3]);
    if (lit === undefined) lit = getPath(ctx, m[3].trim()); // field-to-field comparison
    return m[2] === '==' ? v === lit : v !== lit;
  }
  if (term.startsWith('!')) return !isTruthy(getPath(ctx, term.slice(1).trim()));
  return isTruthy(getPath(ctx, term));
}

export function evalExpr(expr, ctx) {
  if (expr == null || String(expr).trim() === '') return true;
  return String(expr)
    .split(/\s+or\s+/)
    .some(group => group.split(/\s+and\s+/).every(t => evalTerm(t, ctx)));
}

export function oxfordJoin(items, conj = 'and') {
  const a = (items || []).filter(x => x != null && String(x).trim() !== '').map(String);
  if (a.length === 0) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} ${conj} ${a[1]}`;
  return `${a.slice(0, -1).join(', ')}, ${conj} ${a[a.length - 1]}`;
}

// ---- block-tag parser ----------------------------------------------------

const TAG_RE = /\{\{\s*(#if|#unless|#each|else|\/if|\/unless|\/each)\b\s*([^}]*)\}\}/g;

function tokenize(src) {
  const tokens = [];
  let last = 0;
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(src))) {
    if (m.index > last) tokens.push({ type: 'text', value: src.slice(last, m.index) });
    tokens.push({ type: 'tag', tag: m[1], arg: m[2].trim() });
    last = TAG_RE.lastIndex;
  }
  if (last < src.length) tokens.push({ type: 'text', value: src.slice(last) });
  return tokens;
}

function parse(tokens, pos = 0, closers = []) {
  const nodes = [];
  while (pos < tokens.length) {
    const t = tokens[pos];
    if (t.type === 'text') { nodes.push(t); pos++; continue; }
    if (closers.includes(t.tag)) return { nodes, pos };
    if (t.tag === '#if' || t.tag === '#unless') {
      const close = t.tag === '#if' ? '/if' : '/unless';
      const a = parse(tokens, pos + 1, ['else', close]);
      let elseNodes = [];
      pos = a.pos;
      if (tokens[pos] && tokens[pos].tag === 'else') {
        const b = parse(tokens, pos + 1, [close]);
        elseNodes = b.nodes;
        pos = b.pos;
      }
      if (!tokens[pos] || tokens[pos].tag !== close) throw new Error(`Unclosed {{${t.tag} ${t.arg}}}`);
      nodes.push({ type: t.tag === '#if' ? 'if' : 'unless', expr: t.arg, then: a.nodes, else: elseNodes });
      pos++;
      continue;
    }
    if (t.tag === '#each') {
      const a = parse(tokens, pos + 1, ['/each']);
      pos = a.pos;
      if (!tokens[pos]) throw new Error(`Unclosed {{#each ${t.arg}}}`);
      nodes.push({ type: 'each', path: t.arg, body: a.nodes });
      pos++;
      continue;
    }
    throw new Error(`Unexpected {{${t.tag}}}`);
  }
  if (closers.length) throw new Error(`Missing {{${closers[closers.length - 1]}}}`);
  return { nodes, pos };
}

const VAR_RE = /\{\{\s*([^#/}][^}]*?)\s*\}\}/g;

function renderInline(text, ctx, missing) {
  return text.replace(VAR_RE, (_, raw) => {
    let m;
    if ((m = raw.match(/^list\s+(\S+)(?:\s+"(\w+)")?$/))) {
      const v = getPath(ctx, m[1]);
      const joined = oxfordJoin(Array.isArray(v) ? v : [], m[2] || 'and');
      if (joined) return joined;
      missing.add(m[1]);
      return MISSING_OPEN + m[1] + MISSING_CLOSE;
    }
    const [pathPart, fallback] = raw.split(/\s*\|\|\s*/);
    const v = getPath(ctx, pathPart.trim());
    if (isTruthy(v) && !Array.isArray(v) && typeof v !== 'object') return String(v);
    if (fallback !== undefined) {
      const lit = parseLiteral(fallback);
      if (lit !== undefined) return String(lit);
      const fv = getPath(ctx, fallback.trim());
      if (isTruthy(fv)) return String(fv);
    }
    missing.add(pathPart.trim());
    return MISSING_OPEN + pathPart.trim() + MISSING_CLOSE;
  });
}

function renderNodes(nodes, ctx, missing) {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') out += renderInline(n.value, ctx, missing);
    else if (n.type === 'if') out += renderNodes(evalExpr(n.expr, ctx) ? n.then : n.else, ctx, missing);
    else if (n.type === 'unless') out += renderNodes(!evalExpr(n.expr, ctx) ? n.then : n.else, ctx, missing);
    else if (n.type === 'each') {
      const list = getPath(ctx, n.path);
      if (Array.isArray(list)) {
        list.forEach((item, i) => {
          out += renderNodes(n.body, { ...ctx, this: item, '@index': i + 1 }, missing);
        });
      }
    }
  }
  return out;
}

export function renderTemplate(src, ctx) {
  const missing = new Set();
  const { nodes } = parse(tokenize(src));
  // A value ending in a period (e.g. "Inc.") at the end of a sentence would
  // otherwise print a double period.
  const text = renderNodes(nodes, ctx, missing).replace(/(\w)\.\.(?!\.)/g, '$1.');
  return { text, missing: [...missing] };
}

// ---- markdown subset -> blocks ------------------------------------------

export function parseInline(s) {
  // returns runs: [{text, bold, missing}]
  const runs = [];
  const re = /(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/g;
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**')) runs.push({ text: tok.slice(2, -2), bold: true });
    else runs.push({ text: tok.slice(2, -2), missing: true });
    last = re.lastIndex;
  }
  if (last < s.length) runs.push({ text: s.slice(last) });
  return runs;
}

export function toBlocks(text) {
  const blocks = [];
  let para = [];
  const flush = () => {
    if (para.length) {
      blocks.push({ type: 'p', runs: parseInline(para.join(' ')) });
      para = [];
    }
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    let m;
    if (!line) { flush(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flush();
      blocks.push({ type: 'h' + m[1].length, runs: parseInline(m[2]) });
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      flush();
      blocks.push({ type: 'li', runs: parseInline(m[1]) });
    } else if ((m = line.match(/^\d+\.\s+(.*)$/))) {
      flush();
      blocks.push({ type: 'oli', runs: parseInline(m[1]) });
    } else {
      para.push(line);
    }
  }
  flush();
  // number consecutive ordered items, restarting after any other block
  let n = 0;
  for (const b of blocks) {
    if (b.type === 'oli') b.n = ++n;
    else if (b.type !== 'li') n = 0;
  }
  return blocks;
}

// ---- manual assembly ----------------------------------------------------

export function policyApplies(policy, ctx) {
  const selected = getPath(ctx, 'program.manuals') || [];
  const manuals = policy.manuals || ['*'];
  if (!manuals.includes('*') && !manuals.some(code => selected.includes(code))) return false;
  return evalExpr(policy.appliesIf, ctx);
}

export function renderPolicy(policy, ctx) {
  const { text, missing } = renderTemplate(policy.body, ctx);
  return { policy, blocks: toBlocks(text), missing };
}

export function buildManual(policies, ctx) {
  const included = [];
  const excluded = [];
  for (const p of policies) {
    if (policyApplies(p, ctx)) included.push(renderPolicy(p, ctx));
    else excluded.push(p);
  }
  const crosswalk = included.flatMap(r =>
    (r.policy.crosswalk || []).filter(c => evalExpr(c.showIf, ctx)).map(c => ({ ...c, policyId: r.policy.id, policyTitle: r.policy.title, number: r.policy.number }))
  );
  const missing = [...new Set(included.flatMap(r => r.missing))];
  return { included, excluded, crosswalk, missing };
}
