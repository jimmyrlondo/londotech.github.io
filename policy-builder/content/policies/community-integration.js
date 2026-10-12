export default {
  id: 'community-integration',
  number: '3.12',
  section: 'SPECIFIC',
  standard: 'BH 3 / ECS 3',
  topic: 'Community Integration',
  title: 'Community Integration',
  manuals: ['BH', 'ECS'],
  appliesIf: 'program.bhPrograms contains "communityIntegration" or program.ecsPrograms contains "communityIntegration"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'BH 3 / ECS 3', topic: 'Community Integration: program description', heading: 'Program Description' },
    { standard: 'BH 3 / ECS 3', topic: 'Community Integration: eligibility', heading: 'Eligibility' },
    { standard: 'BH 3 / ECS 3', topic: 'Community Integration: services and activities', heading: 'Service Components' },
    { standard: 'BH 3 / ECS 3', topic: 'Community Integration: choice and integrated settings (HCBS settings rule)', heading: 'Choice and Integrated Settings' },
    { standard: 'BH 3 / ECS 3', topic: 'Community Integration: personnel', heading: 'Staffing and Qualifications' },
    { standard: 'BH 3 / ECS 3', topic: 'Community Integration: service delivery and safety in the community', heading: 'Service Delivery Procedures' },
    { standard: 'BH 3 / ECS 3', topic: 'Community Integration: transition', heading: 'Transition and Discharge' },
    { standard: 'BH 3 / ECS 3', topic: 'Community Integration: outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Section references are best estimates: Community Integration appears among the core program standards in Section 3 of the BH manual and among the community services standards in Section 3 of the ECS manual; verify the letters against the current manuals. The HCBS settings rule (42 CFR 441.301(c)(4)) applies to Medicaid waiver-funded day services; confirm the state transition plan and any heightened-scrutiny status of agency-operated day sites. Suggested defaults: staff-to-person ratios set in each plan, activity calendar planned with persons served at least monthly, outcomes reviewed quarterly. For Ohio DD adult day support and vocational habilitation, confirm OAC 5123-9 requirements, including group size limits and the integrated community setting rules. A BH clubhouse following the Clubhouse International standards may want its own program description.',
  body: `
## Purpose

To describe how {{agency.name}} helps persons served take part in the life of their community through activities, relationships, and roles they choose.

## Scope

This policy applies to all community integration personnel and supervisors. Assessment, planning, rights, and discharge are covered in Policy 2.03 Assessment of Persons Served, Policy 2.04 Person-Centered Planning, Policy 1.19 Rights of Persons Served, and Policy 2.05 Transition and Discharge. This policy adds what is specific to community integration.

## Program Description

Community integration helps persons served build skills, connections, and confidence in ordinary community places such as libraries, recreation centers, places of worship, volunteer sites, classes, and local businesses. {{#if program.ecsPrograms contains "communityIntegration"}}{{#if program.populations contains "idd"}}For persons with developmental disabilities, day{{else}}Day{{/if}} services take place mostly in the community, with any agency site used as a base rather than a destination. {{/if}}{{#if program.bhPrograms contains "communityIntegration"}}For persons in mental health or substance use recovery, the program offers psychosocial rehabilitation and peer-supported activities that build recovery, wellness, and natural supports. {{/if}}Services are offered {{program.hours || "on the days and times listed in the program schedule"}}.

{{#if program.payers}}The program is funded through {{list program.payers}}, and personnel follow each payer's authorization and documentation rules.

{{/if}}## Eligibility

The program serves {{list program.populationLabels}} who want to expand their participation in community life and whose plan identifies community integration as a support they need. {{#if program.hcbs or program.ecsPrograms contains "communityIntegration"}}Persons funded through a Medicaid waiver have the service authorized in their individual plan before it begins. {{/if}}{{#if program.servesMinors}}Youth take part only with the written consent of a parent or guardian. {{/if}}

## Service Components

- Exploring interests and trying new activities in the community
- Building social skills and relationships with people who are not paid to be there
- Using community resources such as transit, stores, banks, and libraries
- Volunteering, classes, clubs, and other valued community roles
- Self-advocacy, decision-making, and safety skills
- Health, wellness, and recreation activities{{#if program.bhPrograms contains "communityIntegration"}}
- Peer support, recovery education, and wellness planning{{/if}}

## Choice and Integrated Settings

Each person chooses the activities they take part in, with whom, and how often. Personnel offer real options, including activities with people without disabilities, and do not assign people to group outings because it is convenient for staffing. Group sizes stay small enough that each person can participate as an individual and be seen as a community member rather than part of a group from a program.

{{#if program.hcbs or program.ecsPrograms contains "communityIntegration" or program.populations contains "idd"}}When services are funded through Medicaid home and community-based services, {{agency.name}} follows the federal HCBS settings rule: services support full access to the community, persons served choose among settings, and their privacy, dignity, and independence are protected. Any limit on a person's freedom is based on an assessed need, documented in the plan with the person's informed consent, and reviewed regularly.

{{/if}}Activities that take place at an agency site are planned with persons served, are age-appropriate, and lead toward community participation.

## Staffing and Qualifications

Personnel meet the qualifications in their job description and any payer or state rule. Before working alone with persons served, they complete training on person-centered practices, community safety, the plans of the persons they support, and emergency procedures. {{#if program.bhPrograms contains "communityIntegration"}}Peer specialists hold any certification required by the state. {{/if}}Staffing levels are set so each person receives the support level described in their plan.

## Service Delivery Procedures

1. Persons served and personnel plan the activity calendar together at least monthly.
2. Before each outing, personnel confirm each person's choice to attend, needed supports, medical information, and emergency contacts.
3. Personnel carry a phone and emergency contact information for each person during community activities.
4. Attendance, activities, and progress toward plan goals are documented each day services are provided.{{#if ops.transportation}}
5. Transportation to and from activities follows Policy 1.15 Transportation of Persons Served.{{/if}}{{#if ops.medsAny}}

Medications needed during community activities are handled according to Policy 2.06 Medication Management.{{/if}}{{#if ops.clientFunds}}

When personnel help a person spend their own money in the community, they follow Policy 1.10 Funds of Persons Served.{{/if}}

## Transition and Discharge

As persons served build connections and skills, personnel help them move toward natural supports, community memberships, or employment that reduce reliance on paid support. Transitions follow Policy 2.05 Transition and Discharge.

## Outcomes Measured

At least quarterly, the program measures time spent in integrated community settings, new community connections or roles, progress toward plan goals, and satisfaction of persons served. Results are reported to the {{roles.quality.title}}.

## Responsibilities

- {{roles.clinical.title}}: oversees the program and its outcomes.
- Program supervisors: approve schedules, monitor staffing and safety, and review documentation.
- Direct support personnel: plan, provide, and document activities with persons served.
`,
};
