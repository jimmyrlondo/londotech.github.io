// Intake schema: every question the app asks, declared as data.
// Field `path` is where the answer lives on the agency profile, and is the
// same path policy templates use (see AUTHORING.md).

export const MANUALS = [
  { code: 'BH', name: 'Behavioral Health' },
  { code: 'ECS', name: 'Employment and Community Services' },
  { code: 'AS', name: 'Aging Services' },
  { code: 'CYS', name: 'Child and Youth Services' },
  { code: 'OTP', name: 'Opioid Treatment Program' },
  { code: 'MED', name: 'Medical Rehabilitation' },
];

export const POPULATIONS = [
  { code: 'adults', label: 'adults' },
  { code: 'older', label: 'older adults' },
  { code: 'youth', label: 'children and adolescents' },
  { code: 'idd', label: 'persons with intellectual and developmental disabilities' },
  { code: 'smi', label: 'persons with serious mental illness' },
  { code: 'sud', label: 'persons with substance use disorders' },
  { code: 'brain', label: 'persons with brain injury' },
  { code: 'physical', label: 'persons with physical disabilities' },
  { code: 'veterans', label: 'veterans' },
  { code: 'justice', label: 'persons involved in the justice system' },
];

export const SETTINGS = [
  { code: 'residential', label: 'residential' },
  { code: 'outpatient', label: 'outpatient / office-based' },
  { code: 'community', label: 'community-based' },
  { code: 'inhome', label: 'in-home' },
  { code: 'day', label: 'day program' },
  { code: 'employment', label: 'employment and vocational' },
  { code: 'telehealth', label: 'telehealth' },
  { code: 'crisis', label: 'crisis' },
];

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
};

const ROLE_DEFAULTS = {
  executive: 'Executive Director',
  clinical: 'Clinical Director',
  compliance: 'Compliance Officer',
  privacy: 'Privacy Officer',
  hr: 'Human Resources Manager',
  finance: 'Finance Director',
  safety: 'Health and Safety Coordinator',
  quality: 'Quality Improvement Coordinator',
  it: 'Information Technology Manager',
  rights: 'Client Rights Officer',
};

const role = (key, label) => ({
  key,
  label,
  fields: [
    { path: `roles.${key}.title`, label: 'Position title', type: 'text', placeholder: ROLE_DEFAULTS[key] },
    { path: `roles.${key}.name`, label: 'Current person (optional)', type: 'text' },
  ],
});

export const STEPS = [
  {
    id: 'agency',
    title: 'Agency',
    intro: 'Basic identity details. These appear on every policy header and throughout the text.',
    fields: [
      { path: 'agency.legalName', label: 'Legal name', type: 'text', required: true },
      { path: 'agency.dba', label: 'Name used in policies (DBA or short name)', type: 'text', help: 'Leave blank to use the legal name.' },
      { path: 'agency.orgType', label: 'Organization type', type: 'select', options: [
        ['nonprofit', 'Nonprofit'], ['forprofit', 'For-profit'], ['government', 'Government'], ['tribal', 'Tribal'] ], required: true },
      { path: 'agency.address', label: 'Main address', type: 'text' },
      { path: 'agency.city', label: 'City', type: 'text', half: true },
      { path: 'agency.state', label: 'State', type: 'text', half: true, placeholder: 'OH', required: true },
      { path: 'agency.zip', label: 'ZIP', type: 'text', half: true },
      { path: 'agency.phone', label: 'Main phone', type: 'text', half: true },
      { path: 'agency.website', label: 'Website', type: 'text' },
      { path: 'agency.staffSize', label: 'Number of personnel', type: 'select', options: [
        ['small', '1 to 15'], ['medium', '16 to 75'], ['large', '76 to 250'], ['xlarge', 'More than 250'] ] },
      { path: 'agency.fiscalYearStart', label: 'Fiscal year begins', type: 'text', placeholder: 'July 1' },
    ],
  },
  {
    id: 'mission',
    title: 'Mission & governance',
    intro: 'Leadership and governance policies quote these directly.',
    fields: [
      { path: 'agency.mission', label: 'Mission statement', type: 'textarea', required: true },
      { path: 'agency.vision', label: 'Vision statement', type: 'textarea' },
      { path: 'agency.values', label: 'Core values', type: 'list', help: 'One per line.' },
      { path: 'agency.hasBoard', label: 'The organization has a governing board', type: 'checkbox' },
      { path: 'agency.governingBody', label: 'Name of governing body', type: 'text', placeholder: 'Board of Directors', showIf: 'agency.hasBoard' },
      { path: 'agency.boardMeetingFrequency', label: 'Board meets', type: 'select', showIf: 'agency.hasBoard', options: [
        ['monthly', 'monthly'], ['every other month', 'every other month'], ['quarterly', 'quarterly'] ] },
    ],
  },
  {
    id: 'locations',
    title: 'Locations',
    intro: 'Every site where services are delivered or administered. Emergency procedures are written for each one.',
    fields: [
      { path: 'locations', label: 'Locations', type: 'repeat', itemLabel: 'Location', itemFields: [
        { key: 'name', label: 'Location name', type: 'text' },
        { key: 'address', label: 'Address', type: 'text' },
        { key: 'services', label: 'Services provided here', type: 'text' },
      ] },
    ],
  },
  {
    id: 'roles',
    title: 'Key positions',
    intro: 'Policies assign responsibility by position title, not by person, so they stay valid when staff change. One person can hold several of these.',
    groups: [
      role('executive', 'Chief executive'),
      role('clinical', 'Clinical / program leadership'),
      role('compliance', 'Corporate compliance'),
      role('privacy', 'Privacy and confidentiality'),
      role('hr', 'Human resources'),
      role('finance', 'Finance'),
      role('safety', 'Health and safety'),
      role('quality', 'Performance improvement'),
      role('it', 'Technology'),
      role('rights', 'Rights and grievances'),
    ],
  },
  {
    id: 'programs',
    title: 'Programs & people served',
    intro: 'This decides which CARF manuals apply and which policies and clauses are included.',
    fields: [
      { path: 'program.manuals', label: 'CARF standards manuals the agency is surveying under', type: 'multi', options: MANUALS.map(m => [m.code, m.name]), required: true },
      { path: 'program.populations', label: 'Persons served', type: 'multi', options: POPULATIONS.map(p => [p.code, p.label]) },
      { path: 'program.settings', label: 'Service settings', type: 'multi', options: SETTINGS.map(s => [s.code, s.label]) },
      { path: 'program.serviceList', label: 'Programs and services offered', type: 'list', help: 'One per line, as you would name them to a surveyor.' },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    intro: 'Each answer turns whole policies or sections on or off.',
    fields: [
      { path: 'ops.medication', label: 'Medication involvement', type: 'select', required: true, options: [
        ['none', 'No involvement with medications'],
        ['monitor', 'Persons served self-administer; staff monitor or assist'],
        ['administer', 'Staff administer medications'],
        ['prescribe', 'Agency prescribers prescribe medications'] ] },
      { path: 'ops.restraint', label: 'Restraint and seclusion', type: 'select', required: true, options: [
        ['never', 'Never used'],
        ['emergency', 'Physical restraint only as an emergency safety intervention'] ] },
      { path: 'ops.transportation', label: 'Agency transports persons served', type: 'checkbox' },
      { path: 'ops.clientFunds', label: 'Agency manages funds on behalf of persons served', type: 'checkbox' },
      { path: 'ops.volunteers', label: 'Uses volunteers', type: 'checkbox' },
      { path: 'ops.students', label: 'Hosts students or interns', type: 'checkbox' },
      { path: 'ops.contractors', label: 'Uses contracted service providers', type: 'checkbox' },
      { path: 'ops.research', label: 'Participates in research involving persons served', type: 'checkbox' },
      { path: 'ops.fundraising', label: 'Conducts fundraising', type: 'checkbox' },
      { path: 'ops.remoteWork', label: 'Some personnel work remotely', type: 'checkbox' },
      { path: 'ops.ehrSystem', label: 'Electronic health record system', type: 'text', placeholder: 'e.g. ReadyCare' },
      { path: 'ops.telehealthPlatform', label: 'Telehealth platform', type: 'text', showIf: 'program.settings contains "telehealth"' },
    ],
  },
  {
    id: 'compliance',
    title: 'Regulatory',
    intro: 'State-specific agencies and laws named in the policies.',
    fields: [
      { path: 'compliance.hipaa', label: 'The agency is a HIPAA covered entity', type: 'checkbox' },
      { path: 'compliance.part2', label: 'Records are protected by 42 CFR Part 2 (substance use treatment)', type: 'checkbox' },
      { path: 'compliance.licensingAgency', label: 'State licensing / certifying agency', type: 'text', placeholder: 'e.g. Ohio Department of Developmental Disabilities' },
      { path: 'compliance.abuseReportingAgency', label: 'Agency that receives abuse and neglect reports', type: 'text' },
      { path: 'compliance.abuseHotline', label: 'Abuse reporting phone number', type: 'text', half: true },
      { path: 'compliance.retentionYears', label: 'Record retention period (years)', type: 'number', half: true, placeholder: '7' },
    ],
  },
  {
    id: 'admin',
    title: 'Manual settings',
    intro: 'How the finished manual is dated, approved, and reviewed.',
    fields: [
      { path: 'admin.effectiveDate', label: 'Effective date', type: 'date', required: true },
      { path: 'admin.reviewFrequency', label: 'Policies are reviewed', type: 'select', options: [
        ['annually', 'annually'], ['every two years', 'every two years'] ] },
      { path: 'admin.approver', label: 'Approved by', type: 'text', help: 'Defaults to the governing body, or the chief executive if there is no board.' },
      { path: 'admin.version', label: 'Manual version label', type: 'text', placeholder: '1.0' },
    ],
  },
];

export function emptyProfile() {
  return {
    agency: { orgType: 'nonprofit', hasBoard: true, values: [] },
    locations: [{ name: 'Main Office', address: '', services: '' }],
    roles: {},
    program: { manuals: [], populations: [], settings: [], serviceList: [] },
    ops: { medication: 'none', restraint: 'never' },
    compliance: { hipaa: true, part2: false },
    admin: { reviewFrequency: 'annually', version: '1.0' },
  };
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const labelsFor = (codes, table) =>
  (codes || []).map(c => (table.find(t => t.code === c) || {}).label).filter(Boolean);

// Builds the template context: the raw profile plus defaults and derived
// flags. Templates should prefer derived values (e.g. agency.name,
// roles.x.title) over raw ones so defaults apply consistently.
export function buildContext(profile) {
  const p = structuredClone(profile || emptyProfile());
  p.agency = p.agency || {};
  p.program = p.program || {};
  p.ops = p.ops || {};
  p.compliance = p.compliance || {};
  p.admin = p.admin || {};
  p.locations = (p.locations || []).filter(l => l && (l.name || l.address));

  p.agency.name = p.agency.dba || p.agency.legalName || '';
  p.agency.governingBody = p.agency.hasBoard ? (p.agency.governingBody || 'Board of Directors') : '';
  p.agency.isNonprofit = p.agency.orgType === 'nonprofit';
  const st = String(p.agency.state || '').trim();
  p.agency.stateName = STATE_NAMES[st.toUpperCase()] || st;
  p.agency.cityState = [p.agency.city, p.agency.state].filter(Boolean).join(', ');

  p.roles = p.roles || {};
  for (const [key, def] of Object.entries(ROLE_DEFAULTS)) {
    const r = p.roles[key] || {};
    p.roles[key] = { title: r.title || def, name: r.name || '' };
  }

  const pr = p.program;
  pr.manuals = pr.manuals || [];
  pr.populations = pr.populations || [];
  pr.settings = pr.settings || [];
  pr.manualNames = pr.manuals.map(c => (MANUALS.find(m => m.code === c) || {}).name).filter(Boolean);
  pr.populationLabels = labelsFor(pr.populations, POPULATIONS);
  pr.settingLabels = labelsFor(pr.settings, SETTINGS);
  pr.servesMinors = pr.populations.includes('youth') || pr.manuals.includes('CYS');
  pr.residential = pr.settings.includes('residential');
  pr.telehealth = pr.settings.includes('telehealth');
  pr.sud = pr.populations.includes('sud') || pr.manuals.includes('OTP');
  for (const m of MANUALS) pr[m.code] = pr.manuals.includes(m.code);

  const med = p.ops.medication || 'none';
  p.ops.medsAny = med !== 'none';
  p.ops.administersMeds = med === 'administer' || med === 'prescribe';
  p.ops.prescribes = med === 'prescribe';
  p.ops.usesRestraint = p.ops.restraint === 'emergency';

  p.compliance.retentionYears = p.compliance.retentionYears || 7;
  p.compliance.part2 = Boolean(p.compliance.part2);

  p.admin.effectiveDateText = formatDate(p.admin.effectiveDate);
  p.admin.reviewFrequency = p.admin.reviewFrequency || 'annually';
  p.admin.approver = p.admin.approver || p.agency.governingBody || p.roles.executive.title;
  p.admin.version = p.admin.version || '1.0';

  p.multipleLocations = p.locations.length > 1;
  return p;
}
