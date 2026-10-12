export default {
  id: 'supported-living',
  number: '3.13',
  section: 'SPECIFIC',
  standard: 'BH 3 / ECS 3',
  topic: 'Supported Living',
  title: 'Supported Living',
  manuals: ['BH', 'ECS'],
  appliesIf: 'program.bhPrograms contains "supportedLiving" or program.ecsPrograms contains "supportedLiving"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'BH 3 / ECS 3', topic: 'Supported Living: program description', heading: 'Program Description' },
    { standard: 'BH 3 / ECS 3', topic: 'Supported Living: eligibility', heading: 'Eligibility' },
    { standard: 'BH 3 / ECS 3', topic: 'Supported Living: the person\'s own home, lease, and roommates', heading: 'The Person\'s Own Home' },
    { standard: 'BH 3 / ECS 3', topic: 'Supported Living: supports provided', heading: 'Service Components' },
    { standard: 'BH 3 / ECS 3', topic: 'Supported Living: personnel', heading: 'Staffing and Qualifications' },
    { standard: 'BH 3 / ECS 3', topic: 'Supported Living: emergency and backup coverage', heading: 'Emergency and Backup Coverage' },
    { standard: 'BH 3 / ECS 3', topic: 'Supported Living: service delivery and documentation', heading: 'Service Delivery Procedures' },
    { standard: 'BH 3 / ECS 3', topic: 'Supported Living: electronic visit verification', heading: 'Electronic Visit Verification', showIf: 'ops.evv' },
    { standard: 'BH 3 / ECS 3', topic: 'Supported Living: transition', heading: 'Transition and Discharge' },
    { standard: 'BH 3 / ECS 3', topic: 'Supported Living: outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Section references are best estimates: Supported Living appears among the core program standards in Section 3 of the BH manual and the community services standards in Section 3 of the ECS manual; verify the letters against the current manuals. Supported living assumes the person controls their own home; if the agency owns or leases the home, Policy 3.14 Community Housing may fit better, and the HCBS settings rule (42 CFR 441.301(c)(4)) requires a legally enforceable agreement with eviction protections. Suggested defaults: home safety review at move-in and at least annually, backup response within 2 hours for a missed shift, supervisor visit to each home at least quarterly. For Ohio DD homemaker/personal care and shared living, confirm OAC 5123-9 rules, the provider-controlled setting rules, and county board requirements for backup plans in the ISP. The Electronic Visit Verification subsection prints only when the intake marks EVV; confirm the state EVV model (state-sponsored or alternate vendor), the rules for manual edits and reason codes, and the weekly exception review default against the state Medicaid EVV requirements.',
  body: `
## Purpose

To describe how {{agency.name}} provides supports that help persons served live in a home of their own and take part in their community.

## Scope

This policy applies to personnel who provide or supervise supported living services. Assessment, planning, rights, and discharge are covered in Policy 2.03 Assessment of Persons Served, Policy 2.04 Person-Centered Planning, Policy 1.19 Rights of Persons Served, and Policy 2.05 Transition and Discharge. This policy adds what is specific to supported living.

## Program Description

Supported living provides individualized support in the home of the person served, whether they live alone, with family, or with roommates of their choice. The amount and type of support range from a few hours a week to around-the-clock support, as set in each person's plan. {{#if program.ecsPrograms contains "supportedLiving"}}{{#if program.populations contains "idd"}}For persons with developmental disabilities, supports are usually authorized through a Medicaid waiver and delivered according to the individual service plan. {{/if}}{{/if}}{{#if program.hcbs}}Supports funded through Medicaid home and community-based services follow the federal HCBS settings rule: the person chooses where and with whom they live, has full access to the community, and keeps their privacy and independence, and any limit is based on an assessed need, agreed to in the plan, and reviewed regularly. {{/if}}{{#if program.bhPrograms contains "supportedLiving"}}For persons in mental health or substance use recovery, supports focus on keeping housing, managing symptoms, and building a recovery-oriented daily routine. {{/if}}The office is open {{program.hours || "during regular business hours"}}, and supports in the home follow each person's schedule.

{{#if program.payers}}Supported living is funded through {{list program.payers}}, and personnel follow each payer's authorization and documentation rules.

{{/if}}## Eligibility

The program serves {{list program.populationLabels}} who live in, or are moving to, a home they control and who need support to live there successfully. The person, or their guardian when one has authority, chooses supported living and the level of support in the plan.

## The Person's Own Home

- The lease, mortgage, or rental agreement is in the name of the person served (or their guardian or family), not {{agency.name}}.
- The person chooses where they live and whether to have roommates, and chooses those roommates.
- The person controls who enters their home. Personnel knock, wait for permission, and treat the home as private property.
- The person decides how their home is decorated and furnished, their daily schedule, and when and with whom they eat.
- The person has privacy in their bedroom and bathroom, and access to food and visitors at any time.
- Receiving support from {{agency.name}} is never a condition of keeping the home. If the person changes providers, they can stay.

## Service Components

Depending on the plan, supports may include:

- Household tasks such as cooking, cleaning, laundry, and shopping
- Budgeting, paying bills, and dealing with landlords and utilities
- Health routines, appointments, and wellness
- Personal care, when the plan includes it
- Using community resources and building relationships
- Home safety, including fire safety and emergency planning

## Staffing and Qualifications

Personnel meet the qualifications in their job description and any state or payer rule, and complete training on person-centered practices, rights, the plans of the persons they support, and emergency procedures before working alone in a home. Whenever possible, the person served helps choose the personnel who support them.

## Emergency and Backup Coverage

Every person has an individual backup plan, written with them, that states who will provide support if a scheduled staff member cannot. A supervisor is on call at all times. When a shift is missed or a staff member calls off, the supervisor arranges coverage within 2 hours, or sooner if the plan identifies the person as unable to be left alone. Each person has an emergency plan for fire, severe weather, and medical emergencies, and practices it with personnel.

## Service Delivery Procedures

1. A home safety review is completed with the person at move-in and at least annually, and concerns are addressed with the person and landlord.
2. Personnel document each visit or shift, including supports provided and progress toward goals.
3. A supervisor visits each home at least quarterly to observe supports and hear from the person served.
4. Concerns about health, safety, or the home are reported to the supervisor the same day.{{#if ops.medsAny}}
5. Help with medications follows Policy 2.06 Medication Management.{{/if}}{{#if ops.clientFunds}}

When the person has authorized {{agency.name}} to help manage their money, Policy 1.10 Funds of Persons Served applies. Rent and bills are paid in the person's name from their own funds.{{/if}}

{{#if ops.evv}}### Electronic Visit Verification

Every visit or shift is captured in real time through {{ops.evvSystem || "the state-approved EVV system"}}: the worker checks in and out at the start and end of the visit, which records the service, the person served, the worker, the date, the location, and the start and end times. When a visit cannot be captured in real time, or a record needs correcting, the worker enters a manual edit with the reason for the change, and the supervisor reviews and approves the edit before the visit is billed. The supervisor reviews EVV exceptions (missed or late check-ins, visits shorter or longer than scheduled, location mismatches, and manual edits) at least weekly and follows up on patterns with the worker. Only verified visits are billed, and EVV records are reconciled to claims to protect billing integrity.

{{/if}}## Transition and Discharge

Supports are reduced as the person gains skills and natural supports. When supported living ends, the person keeps their home, and personnel help arrange other supports, following Policy 2.05 Transition and Discharge.

## Outcomes Measured

At least quarterly, the program measures housing stability, progress on plan goals, missed shifts and backup plan use, incidents, and satisfaction of persons served. Results are reported to the {{roles.quality.title}}.

## Responsibilities

- {{roles.clinical.title}}: oversees the program and its outcomes.
- Supervisors: schedule supports, manage backup coverage, and visit homes.
- Direct support personnel: provide and document supports as described in each plan.
`,
};
