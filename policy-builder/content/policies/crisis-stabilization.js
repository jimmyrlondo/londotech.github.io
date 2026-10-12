export default {
  id: 'crisis-stabilization',
  number: '3.06',
  section: 'SPECIFIC',
  standard: 'BH 3',
  topic: 'Crisis Stabilization',
  title: 'Crisis Stabilization',
  manuals: ['BH'],
  appliesIf: 'program.bhPrograms contains "crisisStabilization"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'BH 3', topic: 'Crisis Stabilization: program description', heading: 'Program Description' },
    { standard: 'BH 3', topic: 'Crisis Stabilization: admission and exclusion criteria', heading: 'Admission Criteria' },
    { standard: 'BH 3', topic: 'Crisis Stabilization: service components', heading: 'Service Components' },
    { standard: 'BH 3', topic: 'Crisis Stabilization: 24-hour staffing and medical oversight', heading: 'Staffing and Qualifications' },
    { standard: 'BH 3', topic: 'Crisis Stabilization: admission, observation, and safety', heading: 'Service Delivery Procedures' },
    { standard: 'BH 3', topic: 'Crisis Stabilization: minors', heading: 'Adolescents', showIf: 'program.servesMinors' },
    { standard: 'BH 3', topic: 'Crisis Stabilization: coordination of care', heading: 'Coordination of Care' },
    { standard: 'BH 3', topic: 'Crisis Stabilization: transition and discharge', heading: 'Transition and Discharge Criteria' },
    { standard: 'BH 3', topic: 'Crisis Stabilization: outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Crisis Stabilization is a BH Section 3 core program; verify the current section letter and update the crosswalk. Many states license crisis stabilization units (or 23-hour observation units) under specific rules that set bed limits, maximum length of stay, physician and nursing coverage, and whether persons may be admitted involuntarily; confirm all of these. Suggested defaults: stays up to 5 days (or 23 hours for observation-only units), nursing assessment within 1 hour, prescriber evaluation within 24 hours, observation checks at least every 15 minutes and continuous observation for high risk. If the unit serves minors, state children\'s residential licensing and separation-from-adults rules almost always apply. Restraint and seclusion rules come from Policy 2.07 and state rules; if the unit is permitted to use seclusion, a separate policy is needed.',
  body: `
## Purpose

To describe how {{agency.name}} provides crisis stabilization: short-term, 24-hour care in a safe, calm setting that resolves an acute crisis and avoids unnecessary hospitalization or jail.

## Scope

This policy applies to the crisis stabilization program and to all personnel who work in it. The general program policies in Section 2 also apply, and the crisis intervention policy applies to crisis contacts that lead to admission.

## Program Description

The crisis stabilization program provides a short stay, usually up to 5 days, for persons in a behavioral health crisis who need a safe place and close support but do not need inpatient hospital care. The program operates 24 hours a day, 7 days a week, and accepts admissions at any hour. It is designed as a home-like, trauma-informed environment that is calmer and less restrictive than an emergency department.{{#if program.payers}} Admission is never delayed to verify coverage; when a person has coverage, services are billed to the applicable payer, which may include {{list program.payers "or"}}.{{/if}}

## Admission Criteria

A person may be admitted when they are in an acute behavioral health crisis, are willing to stay voluntarily (or are admitted as state law allows), and can be served safely in the program. A person is referred to an emergency department or hospital instead when they:

- Need medical care beyond the program's capability, including unstable vital signs or severe intoxication or withdrawal
- Present an imminent danger that cannot be managed safely in the program
- Need a locked inpatient setting under {{agency.stateName || "state"}} law

## Service Components

- 24-hour observation, support, and de-escalation
- Nursing assessment and ongoing monitoring of physical health
- Psychiatric evaluation and medication management, under Policy 2.06 Medication Management
- Brief individual counseling, crisis-focused groups, and peer support
- A written safety plan and a crisis plan for future episodes
- Linkage to housing, benefits, and other basic needs that contributed to the crisis
{{#if program.sud}}- Screening and monitoring for intoxication and withdrawal, naloxone at discharge, and linkage to substance use treatment, including medication for substance use disorders
{{/if}}
## Staffing and Qualifications

The program is staffed 24 hours a day with at least 2 personnel awake and on site whenever persons served are present. A registered nurse or licensed practical nurse is on site or on call at all times, and a psychiatrist or other prescriber {{#if ops.prescribes}}employed by{{else}}under contract with{{/if}} {{agency.name}} is available by phone 24 hours a day. A licensed clinician is available for consultation at all times. All personnel are trained in crisis de-escalation, suicide risk assessment, and the approved nonviolent practices curriculum.

## Service Delivery Procedures

1. At admission, personnel complete a safety search of belongings, secure any items that could cause harm, and explain program expectations and rights.
2. A nurse completes a health screening and vital signs within 1 hour of admission.
3. A prescriber evaluates the person within 24 hours of admission.
4. Personnel complete observation checks at least every 15 minutes, and continuous observation when the risk assessment calls for it. Checks are recorded.
5. The team reviews each person daily, updates the safety plan, and plans discharge from the first day.
6. Responses to escalating behavior follow Policy 2.07 Promoting Nonviolent Practices.
7. All care is documented in {{ops.ehrSystem || "the electronic health record"}} each shift.

{{#if program.servesMinors}}## Adolescents

When the program serves minors, minors are housed and supervised separately from adults, and a parent or guardian consents to admission unless state law provides otherwise. The parent or guardian is contacted at admission and takes part in safety and discharge planning.

{{/if}}## Coordination of Care

Personnel accept referrals from crisis teams, emergency departments, law enforcement, and 988, and give referring parties a decision on admission promptly. With consent, personnel contact the person's existing providers within 1 business day of admission.{{#if compliance.part2}} Substance use information is disclosed only under 42 CFR Part 2.{{/if}}

## Transition and Discharge Criteria

A person is discharged when the crisis has resolved, risk has decreased to a level that can be managed in the community, and a safety plan and follow-up appointment are in place. A person is transferred to a hospital when their condition worsens. Each discharge includes a scheduled follow-up appointment within 7 days and a follow-up call from the program within 24 hours. Transition follows Policy 2.05 Transition and Discharge.

## Outcomes Measured

- Discharges to the community rather than to a hospital
- Average length of stay
- Return to crisis services or hospitalization within 30 days
- Attendance at the follow-up appointment within 7 days
{{#if ops.usesRestraint}}- Use of emergency safety interventions
{{/if}}- Satisfaction of persons served

Results are reported to the {{roles.quality.title}} under Policy 1.23 Performance Measurement and Management.

## Responsibilities

The {{roles.clinical.title}} oversees the program and approves its admission criteria. The program manager maintains staffing and the environment of care. Nurses, prescribers, and direct care personnel provide and document care as described in this policy.
`,
};
