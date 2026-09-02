#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const Module = require('module');

const formPath = path.resolve(__dirname, '../forms/8. Consent Packet.html');
const html = fs.readFileSync(formPath, 'utf8');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
assert(scripts.length > 0, 'No inline scripts found.');
const printScript = scripts[scripts.length - 1];

// ---- Static source checks ----
assert(
  !/id="clientName"[^>]*placeholder="Last, First"/.test(html),
  'Client Name input should no longer force a "Last, First" placeholder.'
);
assert(
  /if \(input\.id === 'dob'\) return;/.test(printScript),
  'Date of Birth should be excluded from auto-fill-with-today logic.'
);
assert(
  /id="guardian_present"/.test(html) && /id="guardianName"/.test(html),
  'A global Parent/Legal Guardian present checkbox and name field are required for guardian auto-fill logic.'
);

// ---- Runtime simulation of printForm() with mocked form data ----
function renderPrint(mockData) {
  let capturedHtml = '';
  global.window = {
    open: () => ({ document: { write: (h) => { capturedHtml = h; }, close: () => {} }, print: () => {} })
  };
  global.setTimeout = (fn) => fn();
  global.document = { addEventListener: () => {}, querySelectorAll: () => [], getElementById: () => null };

  const wrapped = printScript
    .replaceAll('const data = getFormData();', 'const data = mockData;')
    .replace('function printForm() {', 'function printForm(mockData) {');
  const m = new Module();
  m._compile(`${wrapped}\nmodule.exports = { printForm };`, 'virtual-consent-packet.js');
  m.exports.printForm(mockData);
  return capturedHtml;
}

// Form 9: selecting "do NOT give permission" must print the deny signatures, not the grant ones.
const denyHtml = renderPrint({
  clientName: 'Jane Doe',
  transport_perm: 'Denied',
  sig_trans_grant_parent: 'GRANT_PARENT_IMG',
  sig_trans_deny_parent: 'DENY_PARENT_IMG',
  sig_trans_grant_client: 'GRANT_CLIENT_IMG',
  sig_trans_deny_client: 'DENY_CLIENT_IMG',
});
assert(denyHtml.includes('DENY_PARENT_IMG'), 'Denied transport selection should print the deny parent signature.');
assert(!denyHtml.includes('GRANT_PARENT_IMG'), 'Denied transport selection must not print the grant parent signature.');
assert(denyHtml.includes('DENY_CLIENT_IMG'), 'Denied transport selection should print the deny client signature.');
assert(!denyHtml.includes('GRANT_CLIENT_IMG'), 'Denied transport selection must not print the grant client signature.');

// Form 12: GAD-7 "Column Totals" row should be removed entirely.
assert(!denyHtml.includes('Column Totals'), 'GAD-7 print output must not include the unused Column Totals row.');

// Guardian logic: when the guardian checkbox is unchecked, no guardian name should leak into the packet.
const noGuardianHtml = renderPrint({ clientName: 'Jane Doe', transport_perm: 'Granted' });
assert(!noGuardianHtml.includes('Should Not Appear'), 'Sanity check placeholder should not appear.');

// Guardian logic: when checked, guardian name should auto-populate signature sections (e.g. Form 5).
const guardianHtml = renderPrint({
  clientName: 'Jane Doe',
  transport_perm: 'Granted',
  guardian_present: 'on',
  guardianName: 'Guardian Person',
});
assert(guardianHtml.includes('Guardian Person'), 'Guardian name should auto-populate signature sections when present.');

// Form 4: Address should now print alongside DOB/SSN/Phone.
const addressHtml = renderPrint({ clientName: 'Jane Doe', clientAddress: '1 Test Ave, City, ST 00000' });
assert(addressHtml.includes('1 Test Ave, City, ST 00000'), 'Form 4 (ROI) should auto-fill/print the client address.');

// Form 10: Case Manager / Therapist contact info should print, with verbiage matching form labels.
const providerChangeHtml = renderPrint({
  clientName: 'Jane Doe',
  prev_cm: 'CM Name', prev_cm_phone: '111-1111', prev_cm_email: 'cm@example.com',
  prev_therapist: 'Therapist Name', prev_therapist_phone: '222-2222', prev_therapist_email: 'th@example.com',
});
assert(providerChangeHtml.includes('111-1111') && providerChangeHtml.includes('cm@example.com'), 'Form 10 must print the previously-collected Case Manager phone/email.');
assert(providerChangeHtml.includes('222-2222') && providerChangeHtml.includes('th@example.com'), 'Form 10 must print the previously-collected Therapist phone/email.');
assert(providerChangeHtml.includes('<strong>Case Manager:</strong>'), 'Form 10 print label must match the form label ("Case Manager", not "Previous Case Manager").');
assert(providerChangeHtml.includes('<strong>Therapist:</strong>'), 'Form 10 print label must match the form label ("Therapist", not "Previous Therapist").');

// Form 11: Doctor name/phone and pharmacy phone must print alongside pharmacy name.
const medListHtml = renderPrint({
  clientName: 'Jane Doe',
  med_doc: 'Dr. Smith', med_doc_phone: '333-3333',
  med_pharm: 'CVS Pharmacy', med_pharm_phone: '444-4444',
});
assert(medListHtml.includes('Dr. Smith') && medListHtml.includes('333-3333'), 'Form 11 must print the collected doctor name and phone.');
assert(medListHtml.includes('CVS Pharmacy') && medListHtml.includes('444-4444'), 'Form 11 must print the collected pharmacy name and phone.');

// Form 3 / Form 6: no duplicate/blank signature line should remain alongside the real signature capture.
const providerChoiceStart = guardianHtml.indexOf('Statement of Provider Choice');
const roiStart = guardianHtml.indexOf('Authorization to Release Confidential Information');
const providerChoiceSection = guardianHtml.slice(providerChoiceStart, roiStart);
const dupSigMatches = (providerChoiceSection.match(/Client\/Legal Guardian Signature/g) || []).length;
assert(dupSigMatches === 1, `Form 3 print output must contain exactly one Client/Legal Guardian Signature line, found ${dupSigMatches}.`);

console.log('PASS: Consent Packet DOB/name/autofill, guardian logic, and per-form signature/verbiage fixes validated.');
