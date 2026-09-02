#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const formPath = path.resolve(__dirname, '../forms/8. Consent Packet.html');
const html = fs.readFileSync(formPath, 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
assert(scripts.length > 0, 'No inline scripts found.');
const printScript = scripts[scripts.length - 1];

try {
  new vm.Script(printScript, { filename: 'Consent Packet inline script' });
} catch (error) {
  throw new Error(`Inline script failed to parse: ${error.message}`);
}

assert(
  /<input type="checkbox" name="choice_ohio_rise_respite"[^>]*>[\s\S]*?OhioRISE Respite Care/.test(html),
  'OhioRISE Respite Care checkbox is missing or incorrectly labeled.'
);
assert(
  /chk\('choice_ohio_rise_respite',\s*'on'\)[\s\S]*?OhioRISE Respite Care/.test(printScript),
  'OhioRISE Respite Care is missing from print output.'
);

const pageBlocks = [...printScript.matchAll(/html \+= `<div class="page">([\s\S]*?)<\/div>`;/g)].map(match => match[1]);
assert(pageBlocks.length === 13, `Expected 13 printed form page blocks, found ${pageBlocks.length}.`);
assert(
  pageBlocks.every(block => /\$\{headerHtml\(`[^`]*`\)\}/.test(block)),
  'Every printed form page must include the Watson logo header at the start of its section.'
);
assert(
  /\.header-logo img \{[^}]*height:\s*80px/.test(printScript),
  'Watson logo should be sized to 80px so forms stay on a single page.'
);
assert(
  !/position:\s*fixed/.test(printScript),
  'Print output must not repeat the Watson logo on physical overflow pages via fixed positioning.'
);

console.log('PASS: Consent Packet branding, OhioRISE service capture, and print output validated.');
