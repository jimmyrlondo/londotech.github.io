export default {
  id: 'case-management',
  number: '3.10',
  section: 'SPECIFIC',
  standard: 'BH 3 / ECS 3 / AS 3 / CYS 3',
  topic: 'Case Management/Services Coordination',
  title: 'Case Management and Services Coordination',
  manuals: ['BH', 'ECS', 'AS', 'CYS'],
  appliesIf: 'program.bhPrograms contains "caseManagement" or program.ecsPrograms contains "caseManagement" or program.asPrograms contains "caseManagement" or program.cysPrograms contains "caseManagement"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'BH 3 / ECS 3 / AS 3 / CYS 3', topic: 'Case Management/Services Coordination: program description and scope', heading: 'Program Description' },
    { standard: 'BH 3 / ECS 3 / AS 3 / CYS 3', topic: 'Case Management/Services Coordination: eligibility and entry', heading: 'Eligibility' },
    { standard: 'BH 3 / ECS 3 / AS 3 / CYS 3', topic: 'Case Management/Services Coordination: linkage, monitoring, and advocacy', heading: 'Service Components' },
    { standard: 'BH 3 / ECS 3 / AS 3 / CYS 3', topic: 'Case Management/Services Coordination: caseloads and personnel', heading: 'Staffing and Caseloads' },
    { standard: 'BH 3 / ECS 3 / AS 3 / CYS 3', topic: 'Case Management/Services Coordination: contact frequency and monitoring', heading: 'Contact Frequency and Monitoring' },
    { standard: 'BH 3 / ECS 3 / AS 3 / CYS 3', topic: 'Case Management/Services Coordination: coordination with other providers', heading: 'Coordination' },
    { standard: 'BH 3 / ECS 3 / AS 3 / CYS 3', topic: 'Case Management/Services Coordination: transition and discharge', heading: 'Transition and Discharge' },
    { standard: 'BH 3 / ECS 3 / AS 3 / CYS 3', topic: 'Case Management/Services Coordination: outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Section references are best estimates: Case Management/Services Coordination appears among the core program standards of the BH manual (Section 3) and in the community services section of the ECS, AS, and CYS manuals; verify the section and letter against the current manual for each manual the agency surveys under. Caseload limits (30 for intensive, 45 for standard) and contact frequencies (monthly contact, face-to-face at least every 90 days, 2 business days to respond to a change) are suggested defaults: confirm against state rules, Medicaid targeted case management rules, waiver rules (for Ohio DD, service and support administration rules under OAC 5126 and 5123), and county board or managed care contracts, which often set higher frequencies. HCBS conflict-free case management (42 CFR 441.301(c)(1)(vi)) generally bars the same agency from both planning and delivering waiver services to the same person; confirm whether the agency qualifies for an exception before keeping the conflict-of-interest paragraph as written.',
  body: `
## Purpose

To describe how {{agency.name}} helps persons served obtain and coordinate the services and resources they need to reach the goals in their plan.

## Scope

This policy applies to all case management and services coordination personnel and supervisors. General requirements for assessment, planning, records, and discharge are in Policy 2.03 Assessment of Persons Served, Policy 2.04 Person-Centered Planning, Policy 2.08 Records of the Persons Served, and Policy 2.05 Transition and Discharge. This policy adds what is specific to case management.

## Program Description

The program serves {{list program.populationLabels}} who need help navigating more than one service system. Case managers work wherever the person served is most comfortable: in the home, in the community, at other providers' offices, and by phone or video when the person prefers. Services are available {{program.hours || "during regular business hours, with after-hours access to crisis resources"}}.

{{#if program.payers}}Case management is funded through {{list program.payers}}. Case managers follow each payer's authorization, contact, and billing rules.

{{/if}}## Eligibility

A person is eligible when they have needs in two or more life areas (such as health, housing, income, education, employment, or legal matters) that they cannot coordinate on their own, and they agree to case management. {{#if program.populations contains "idd"}}For persons with developmental disabilities, eligibility for waiver or county board services is confirmed with the funding source before services begin. {{/if}}{{#if program.servesMinors}}For a minor, the parent or legal guardian consents to services and participates in planning. {{/if}}Persons who do not meet eligibility receive referrals to other resources, as described in Policy 2.02 Screening and Access to Services.

## Service Components

Case management at {{agency.name}} includes:

- **Linkage:** identifying resources that fit the person's goals and preferences, making referrals, and helping the person complete applications and attend first appointments
- **Coordination:** keeping all providers working toward one plan, sharing information with consent, and reducing duplicate or conflicting services
- **Monitoring:** checking that services are delivered as planned and are helping, and acting quickly when they are not
- **Advocacy:** supporting the person to speak for themselves, and speaking up on their behalf when they ask, including with benefits offices, landlords, schools, and other systems
- **Skill building:** teaching the person to manage appointments, paperwork, and resources so they rely on case management less over time
- **Crisis response:** helping the person use their crisis plan and connecting them to emergency services when needed

{{#if program.populations contains "idd"}}For persons receiving developmental disabilities waiver services, services coordination also includes helping the person choose among qualified providers, monitoring health and welfare, and confirming that the services in the plan are authorized and delivered.

{{/if}}{{#if program.asPrograms contains "caseManagement"}}For older adults, case managers also support family caregivers, address risks to living independently, and coordinate with aging network resources.

{{/if}}## Staffing and Caseloads

Case managers meet the education, experience, and credential requirements in their job description and any payer rule. Orientation covers community resources, benefits systems, crisis response, and documentation before a caseload is assigned. Caseloads do not exceed 30 persons for intensive case management or 45 persons for standard case management. The supervisor reviews caseload size and acuity at least monthly and redistributes cases when a caseload becomes unmanageable.

{{#if program.hcbs or program.populations contains "idd"}}When {{agency.name}} also provides direct waiver services, the agency keeps case management separate from service delivery, so the same organization does not both plan and provide services to a person unless a state-approved exception applies. Persons served are told of their right to choose any qualified provider.

{{/if}}## Contact Frequency and Monitoring

1. The case manager has contact with each person served at least monthly, or more often as the plan or payer requires.
2. At least one contact every 90 days is face-to-face{{#if program.residential}}, and contacts for persons in residential settings include visits to where the person lives{{/if}}.
3. When a case manager learns of a change in health, housing, safety, or service delivery, they follow up within 2 business days and update the plan if needed.
4. When a person cannot be reached, the case manager makes and documents at least three attempts using different methods before following the disengagement steps in Policy 2.05.
5. Each contact is documented as a progress note linked to the plan.

## Coordination

With the person's written authorization, the case manager shares information with other providers, schools, courts, and agencies involved in the person's life. {{#if program.servesMinors}}For children and adolescents, coordination includes the family, school, and any child welfare or juvenile justice worker involved. {{/if}}Case managers attend other providers' team meetings when the person wants them there.

## Transition and Discharge

Persons transition out of case management when they can coordinate their own services, choose to end services, move out of the service area, or transfer to a different level of care. The case manager makes sure ongoing services are in place before closing the case, following Policy 2.05 Transition and Discharge.

## Outcomes Measured

The program tracks, at least quarterly: the percentage of referrals completed, contact frequency met, stability in housing and benefits, goal attainment, and satisfaction of persons served. Results are reported to the {{roles.quality.title}}.

## Responsibilities

- {{roles.clinical.title}}: oversees the program, sets caseload limits, and reviews outcomes.
- Case management supervisors: monitor caseloads, review documentation, and provide supervision.
- Case managers: deliver and document services as described in this policy.
`,
};
