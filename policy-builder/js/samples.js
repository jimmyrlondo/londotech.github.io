// Sample profiles used by tests and the content validator.

export const fullProfile = {
  agency: {
    legalName: 'Lakeshore Community Supports, Inc.',
    dba: 'Lakeshore Supports',
    orgType: 'nonprofit',
    address: '1200 Euclid Avenue',
    city: 'Cleveland',
    state: 'OH',
    zip: '44115',
    phone: '(216) 555-0142',
    website: 'lakeshoresupports.org',
    staffSize: 'medium',
    fiscalYearStart: 'July 1',
    mission: 'To support every person we serve in living a self-directed life in the community of their choice.',
    vision: 'Communities where everyone belongs.',
    values: ['Dignity', 'Choice', 'Integrity', 'Safety'],
    hasBoard: true,
    governingBody: 'Board of Trustees',
    boardMeetingFrequency: 'every other month',
  },
  locations: [
    { name: 'Main Office', address: '1200 Euclid Avenue, Cleveland, OH 44115', services: 'Administration, outpatient counseling' },
    { name: 'Parma Group Home', address: '55 Ridge Road, Parma, OH 44129', services: 'Residential supports' },
  ],
  roles: { executive: { title: 'Chief Executive Officer', name: 'Dana Ruiz' } },
  program: {
    manuals: ['BH', 'ECS'],
    populations: ['adults', 'idd', 'smi', 'sud', 'youth'],
    settings: ['residential', 'outpatient', 'community', 'telehealth'],
    serviceList: ['Outpatient counseling', 'Supported living', 'Community employment'],
    bhPrograms: ['outpatient', 'caseManagement', 'crisis'],
    ecsPrograms: ['communityEmployment', 'supportedLiving', 'communityIntegration'],
    hcbs: true,
    payers: ['Ohio Medicaid', 'Cuyahoga County Board of Developmental Disabilities', 'private insurance', 'private pay'],
    hours: 'Monday through Friday, 8:00 a.m. to 6:00 p.m., with 24-hour on-call crisis coverage',
  },
  ops: {
    medication: 'administer',
    restraint: 'emergency',
    transportation: true,
    clientFunds: true,
    volunteers: true,
    students: true,
    contractors: true,
    research: true,
    fundraising: true,
    remoteWork: true,
    ehrSystem: 'ReadyCare',
    vehicles: 'both',
    evv: true,
    evvSystem: 'Sandata',
    telehealthPlatform: 'Doxy.me',
  },
  compliance: {
    hipaa: true,
    part2: true,
    licensingAgency: 'Ohio Department of Mental Health and Addiction Services',
    abuseReportingAgency: 'Ohio Department of Developmental Disabilities Abuse/Neglect Hotline',
    abuseHotline: '1-866-313-6733',
    retentionYears: 7,
    incidentReportHours: 24,
    cpsAgency: 'Cuyahoga County Division of Children and Family Services',
    cpsHotline: '(216) 696-5437',
    protectionAdvocacy: 'Disability Rights Ohio',
    vrAgency: 'Opportunities for Ohioans with Disabilities',
  },
  admin: { effectiveDate: '2026-11-01', reviewFrequency: 'annually', version: '1.0' },
};

// A small agency that answers "no" to almost everything.
export const minimalProfile = {
  agency: {
    legalName: 'Brightpath Employment LLC',
    orgType: 'forprofit',
    state: 'OH',
    city: 'Akron',
    mission: 'Helping people find and keep meaningful work.',
    hasBoard: false,
    values: [],
  },
  locations: [{ name: 'Office', address: '10 Main St, Akron, OH', services: 'All services' }],
  roles: {},
  program: { manuals: ['ECS'], populations: ['adults'], settings: ['employment'], serviceList: ['Job development'], ecsPrograms: ['communityEmployment'] },
  ops: { medication: 'none', restraint: 'never' },
  compliance: { hipaa: false, part2: false, licensingAgency: 'Opportunities for Ohioans with Disabilities', abuseReportingAgency: 'Adult Protective Services', abuseHotline: '1-855-644-6277' },
  admin: { effectiveDate: '2026-11-01' },
};

// Every manual and every program type switched on, so validation renders
// each Section 3 policy and the conditional text for all manuals.
import { PROGRAM_TYPES } from './schema.js';

export const everythingProfile = {
  ...fullProfile,
  program: {
    ...fullProfile.program,
    manuals: ['BH', 'ECS', 'AS', 'CYS', 'OTP'],
    populations: ['adults', 'older', 'youth', 'idd', 'smi', 'sud', 'brain', 'physical', 'veterans', 'justice'],
    settings: ['residential', 'outpatient', 'community', 'inhome', 'day', 'employment', 'telehealth', 'crisis'],
    bhPrograms: PROGRAM_TYPES.BH.map(t => t[0]),
    ecsPrograms: PROGRAM_TYPES.ECS.map(t => t[0]),
    asPrograms: PROGRAM_TYPES.AS.map(t => t[0]),
    cysPrograms: PROGRAM_TYPES.CYS.map(t => t[0]),
    otpPrograms: PROGRAM_TYPES.OTP.map(t => t[0]),
  },
  ops: { ...fullProfile.ops, medication: 'prescribe', subminimumWage: true },
  compliance: {
    ...fullProfile.compliance,
    sota: 'Ohio Department of Mental Health and Addiction Services',
    partCLeadAgency: 'Help Me Grow Early Intervention',
  },
  roles: { ...fullProfile.roles, medical: { title: 'Medical Director', name: '' } },
};
