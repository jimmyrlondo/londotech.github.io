export default {
  id: 'community-housing',
  number: '3.14',
  section: 'SPECIFIC',
  standard: 'BH 3 / ECS 3',
  topic: 'Community Housing',
  title: 'Community Housing',
  manuals: ['BH', 'ECS'],
  appliesIf: 'program.bhPrograms contains "communityHousing" or program.ecsPrograms contains "communityHousing"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'BH 3 / ECS 3', topic: 'Community Housing: program description', heading: 'Program Description' },
    { standard: 'BH 3 / ECS 3', topic: 'Community Housing: admission', heading: 'Admission Criteria' },
    { standard: 'BH 3 / ECS 3', topic: 'Community Housing: occupancy agreements and rent', heading: 'Occupancy Agreements and Rent' },
    { standard: 'BH 3 / ECS 3', topic: 'Community Housing: privacy, choice, and the HCBS settings rule', heading: 'Privacy, Choice, and Home Life' },
    { standard: 'BH 3 / ECS 3', topic: 'Community Housing: home safety and maintenance', heading: 'Home Safety' },
    { standard: 'BH 3 / ECS 3', topic: 'Community Housing: house meetings and input', heading: 'House Meetings' },
    { standard: 'BH 3 / ECS 3', topic: 'Community Housing: personnel', heading: 'Staffing and Qualifications' },
    { standard: 'BH 3 / ECS 3', topic: 'Community Housing: transition and move-out', heading: 'Transition and Discharge' },
    { standard: 'BH 3 / ECS 3', topic: 'Community Housing: outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Section references are best estimates: Community Housing appears among the core program standards in Section 3 of the BH manual and the community services standards in Section 3 of the ECS manual; verify the letters against the current manuals. The HCBS settings rule (42 CFR 441.301(c)(4)(vi)) requires provider-controlled residential settings funded by Medicaid waivers to give each person a lease or other legally enforceable agreement with protections equal to landlord-tenant law, lockable bedroom doors, choice of roommates, control of schedules, access to food, and visitors at any time, with modifications only through the plan. Confirm state landlord-tenant law (notice periods for rent changes and move-out), any state residential licensing rules (for Ohio, OhioMHAS residential facility licensure or DODD rules for provider-controlled settings), fire inspection frequency, and the 30-day notice used below. Fire drill frequency and home inspection timing should match Policy 1.12 Health and Safety and Policy 1.13 Emergency Procedures.',
  body: `
## Purpose

To describe how {{agency.name}} provides or arranges housing in the community that is safe, affordable, and a real home for persons served.

## Scope

This policy applies to homes that {{agency.name}} owns, leases, operates, or arranges for persons served, and to personnel who support residents there. Assessment, planning, rights, and discharge are covered in Policy 2.03 Assessment of Persons Served, Policy 2.04 Person-Centered Planning, Policy 1.19 Rights of Persons Served, and Policy 2.05 Transition and Discharge. Building safety and emergency drills are covered in Policy 1.12 Health and Safety and Policy 1.13 Emergency Procedures.

## Program Description

Community housing offers homes in ordinary neighborhoods, such as apartments and houses shared by a small number of residents, with support available as each person's plan describes. {{#if program.bhPrograms contains "communityHousing"}}For persons in mental health or substance use recovery, housing supports recovery and a path toward independent housing. {{/if}}{{#if program.ecsPrograms contains "communityHousing"}}{{#if program.populations contains "idd"}}For persons with developmental disabilities, housing may be long-term and supports are delivered according to the individual service plan. {{/if}}{{/if}}The program office is open {{program.hours || "during regular business hours"}}, and on-call support is available at all times.

{{#if program.payers}}Housing supports are funded through {{list program.payers}}. Rent is paid separately by residents, as set in their occupancy agreement.

{{/if}}## Admission Criteria

The program serves {{list program.populationLabels}} who choose to live in community housing and whose needs can be met with the support available in the home. Before moving in, the person visits the home, meets the current residents, and has a say in whether the match works for everyone.

## Occupancy Agreements and Rent

1. Each resident signs a lease or written occupancy agreement before moving in, explained in a way they understand.
2. The agreement states the rent and any fees, what they cover, house expectations, how the agreement can end, and the resident's right to appeal.
3. Rent is set fairly, is not raised without at least 30 days' written notice, and leaves the person enough money for personal needs.
4. A resident can be asked to leave only for reasons stated in the agreement and with the notice required by law, never as a punishment or because their support needs change.{{#if ops.clientFunds}}
5. When {{agency.name}} helps a resident manage money, rent payments are handled under Policy 1.10 Funds of Persons Served.{{/if}}

## Privacy, Choice, and Home Life

Each resident has a lockable bedroom door with a key, and only appropriate personnel hold a backup key for emergencies. Residents choose their roommates when rooms are shared, decorate their own space, control their own schedules, have access to food at any time, and have visitors when they choose. {{#if program.hcbs or program.ecsPrograms contains "communityHousing" or program.populations contains "idd"}}Homes funded through Medicaid home and community-based services meet the federal HCBS settings rule, and any limit on these rights is based on an assessed need, agreed to in the plan, and reviewed regularly. {{/if}}House rules are few, written with residents, and never restrict rights for everyone because of one person's needs.

## Home Safety

- Each home is inspected for safety and needed repairs at move-in and at least quarterly, and repairs are tracked to completion.
- Smoke and carbon monoxide detectors, fire extinguishers, and first aid supplies are checked monthly.
- Each resident has an individual emergency plan, and drills are held as Policy 1.13 Emergency Procedures requires.
- Residents can request repairs at any time, and urgent safety repairs are made within 24 hours.{{#if ops.medsAny}}
- Medications are stored and handled according to Policy 2.06 Medication Management.{{/if}}

## House Meetings

Residents hold house meetings at least monthly to plan meals, chores, and activities and to raise concerns. Personnel help as residents request, record decisions, and follow up on concerns. Concerns that are not resolved at the meeting can be taken through Policy 1.20 Complaints and Grievances.

## Staffing and Qualifications

Personnel meet the qualifications in their job description and any state rule, and complete training on rights, privacy, the plans of the residents they support, and emergency procedures before working in a home. Staffing in each home matches what residents' plans require, including overnight support where needed.

## Transition and Discharge

Residents may move to more independent housing at any time, and personnel help them find and prepare for it. Move-outs follow the occupancy agreement and Policy 2.05 Transition and Discharge, and personal belongings are inventoried and returned.

## Outcomes Measured

At least quarterly, the program measures housing stability, moves to more independent housing, incidents in homes, completion of repairs, and resident satisfaction. Results are reported to the {{roles.quality.title}}.

## Responsibilities

- {{roles.clinical.title}}: oversees the program and approves admissions.
- {{roles.safety.title}}: oversees home safety inspections and repairs.
- House supervisors: support house meetings, manage staffing, and address resident concerns.
`,
};
