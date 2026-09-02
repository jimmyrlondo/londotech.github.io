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
  pageBlocks.every(block => block.includes('${headerHtml(')),
  'Every printed form page section must include the header with Watson logo.'
);
assert(
  /\.header-container img \{[^}]*height:\s*80px/.test(printScript),
  'Watson logo height must be set to 80px.'
);
assert(
  /\.header-container \{[^}]*display:\s*flex/.test(printScript),
  'Header layout must place logo and title side-by-side using flexbox.'
);
assert(
  !/position:\s*fixed/.test(printScript),
  'Watson logo must not use fixed positioning on overflow pages.'
);

console.log('PASS: Consent Packet branding, OhioRISE service capture, and print output validated.');
