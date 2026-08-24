#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const formPath = path.resolve(__dirname, '../forms/1. Adult Diagnostic Evaluation.html');
const html = fs.readFileSync(formPath, 'utf8');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
assert(scripts.length > 0, 'No inline scripts found.');

const mainScript = scripts[scripts.length - 1];

assert(
  /<button[^>]*onclick="printForm\(\)"[^>]*>\s*Print Summary\s*<\/button>/i.test(html),
  'Print Summary button is not wired to printForm().'
);

try {
  new vm.Script(mainScript, { filename: 'Adult Diagnostic Evaluation inline script' });
} catch (error) {
  throw new Error(`Inline script failed to parse: ${error.message}`);
}

assert(/function\s+printForm\s*\(/.test(mainScript), 'printForm() function is missing.');
assert(/function\s+getFormData\s*\(/.test(mainScript), 'getFormData() function is missing.');
assert(/function\s+generatePrintView\s*\(/.test(mainScript), 'generatePrintView() function is missing.');
assert(/escapeHtml\s*=/.test(mainScript), 'print escaping helper (escapeHtml) is missing.');
assert(/window\.open\('',\s*'_blank'\)/.test(mainScript), 'print popup open flow is missing.');
assert(/Pop-up blocked\. Please allow pop-ups/.test(mainScript), 'Popup-blocked user message is missing.');
assert(/Object\.prototype\.hasOwnProperty\.call\(data,\s*cleanKey\)/.test(mainScript), 'Repeated field collection safeguard in getFormData() is missing.');
assert(!/createBlockEntry\('Why didn't you finish\?'/i.test(mainScript), 'Unescaped apostrophe regression is still present.');

console.log('PASS: Watson Form 1 Print Summary wiring, parsing, and dependencies validated.');
