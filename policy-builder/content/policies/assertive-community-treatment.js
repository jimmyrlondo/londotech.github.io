export default {
  id: 'assertive-community-treatment',
  number: '3.11',
  section: 'SPECIFIC',
  standard: 'BH 3',
  topic: 'Assertive Community Treatment',
  title: 'Assertive Community Treatment',
  manuals: ['BH'],
  appliesIf: 'program.bhPrograms contains "act"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'BH 3', topic: 'Assertive Community Treatment: program description and fidelity model', heading: 'Program Description' },
    { standard: 'BH 3', topic: 'Assertive Community Treatment: admission criteria', heading: 'Admission Criteria' },
    { standard: 'BH 3', topic: 'Assertive Community Treatment: team composition and caseload', heading: 'Team Composition and Caseload' },
    { standard: 'BH 3', topic: 'Assertive Community Treatment: services provided by the team', heading: 'Service Components' },
    { standard: 'BH 3', topic: 'Assertive Community Treatment: 24-hour availability', heading: '24-Hour Coverage' },
    { standard: 'BH 3', topic: 'Assertive Community Treatment: in vivo service delivery and team meetings', heading: 'Service Delivery Procedures' },
    { standard: 'BH 3', topic: 'Assertive Community Treatment: transition and discharge', heading: 'Transition and Discharge' },
    { standard: 'BH 3', topic: 'Assertive Community Treatment: fidelity and outcomes', heading: 'Fidelity and Outcomes Measured' },
  ],
  consultantNotes: 'Section reference is a best estimate: Assertive Community Treatment appears among the core program standards in Section 3 of the BH manual; verify the letter and any ACT-specific requirements against the current manual. The staffing ratios, 1:10 staff-to-person ratio, 100-person cap, 80 percent community contact target, 4 contacts per week average, and annual fidelity review are drawn from widely used ACT fidelity models (such as the DACTS or TMACT); many states certify ACT teams against their own version, so confirm the state ACT rule (for Ohio, OhioMHAS ACT certification and Ohio Medicaid ACT requirements), the exact team roles, and whether a psychiatric prescriber FTE ratio is set by rule. If the team does not include a nurse or prescriber, this program may not meet ACT fidelity and should be reviewed.',
  body: `
## Purpose

To describe how {{agency.name}} delivers Assertive Community Treatment (ACT), a team-based, high-intensity service for adults with serious mental illness who have not been well served by traditional outpatient care.

## Scope

This policy applies to all members of the ACT team and their supervisors. General requirements for assessment, planning, records, {{#if ops.medsAny}}medication, {{/if}}and discharge are in Policy 2.03 Assessment of Persons Served, Policy 2.04 Person-Centered Planning, Policy 2.08 Records of the Persons Served, {{#if ops.medsAny}}Policy 2.06 Medication Management, {{/if}}and Policy 2.05 Transition and Discharge. This policy adds what is specific to ACT.

## Program Description

The ACT team follows a recognized ACT fidelity model. The team, not an individual worker, shares responsibility for every person served, and provides most treatment, rehabilitation, and support directly rather than referring out. Services are delivered where the person lives, works, and spends time. Office hours are {{program.hours || "set by the team to cover days, evenings, and weekends"}}, with on-call coverage at all other times.

{{#if program.payers}}ACT services are funded through {{list program.payers}}. The team follows each payer's authorization and documentation rules.

{{/if}}## Admission Criteria

A person is considered for ACT when they are an adult with a serious and persistent mental illness and have one or more of the following:

- Repeated psychiatric hospitalizations or crisis episodes in the past year
- Ongoing homelessness or risk of losing housing
- Involvement with the justice system related to their illness
- Co-occurring substance use that complicates treatment
- Difficulty engaging in office-based services despite past efforts

The team leader and psychiatric prescriber make the final admission decision. Admission is not refused because a person has been hard to engage.

## Team Composition and Caseload

The ACT team includes, at a minimum:

- A team leader who is a licensed clinician
- A psychiatric prescriber (psychiatrist or advanced practice nurse)
- Registered nurses
- A substance use specialist
- An employment specialist
- A peer specialist with lived experience of mental illness and recovery
- Additional clinicians or case managers as needed to keep the ratio below

The team maintains a staff-to-person ratio of no more than 1 to 10, not counting the prescriber, and the team serves no more than 100 persons. New admissions are paced so the team can absorb them, usually no more than 4 to 6 per month.

## Service Components

The team provides directly:

- Psychiatric assessment, treatment, and medication support{{#if ops.administersMeds}}, including medication administration and delivery{{/if}}
- Integrated treatment for co-occurring substance use
- Supported employment and education
- Help with housing, benefits, money management, and daily living
- Physical health coordination
- Family education and support, with the person's consent
- Crisis assessment and intervention

## 24-Hour Coverage

The team is available 24 hours a day, 7 days a week. After hours, an ACT team member who knows the persons served answers the on-call line and can respond in person when needed. The on-call staff member has access to each person's crisis plan and current medications, and reports any after-hours contact to the team at the next daily meeting.

## Service Delivery Procedures

1. At least 80 percent of contacts take place in the community (in vivo), not in the office.
2. The team averages at least 4 face-to-face contacts per person per week, adjusted to each person's plan and current needs.
3. The team meets daily to review every person served, assign the day's contacts, and respond to changes.
4. Each person has a small individual treatment team of 3 to 5 members who know them well, while the full team stays responsible.
5. When a person disengages, the team uses persistent, respectful outreach rather than closing the case.{{#if ops.transportation}}

Team members transport persons served to appointments when needed, following Policy 1.15 Transportation of Persons Served.{{/if}}

## Transition and Discharge

ACT is a long-term service, and discharge is uncommon. A person transitions to a less intensive service when they and the team agree that they have sustained recovery goals and no longer need ACT. The team offers a gradual step-down and stays available for readmission, following Policy 2.05 Transition and Discharge.

## Fidelity and Outcomes Measured

The program is reviewed against the ACT fidelity model at least annually, by an outside reviewer when the state requires it. The program also tracks psychiatric hospital days, emergency department visits, housing stability, employment, justice involvement, and satisfaction of persons served. Results and fidelity action plans are reported to the {{roles.quality.title}}.

## Responsibilities

- {{roles.clinical.title}}: oversees the program and fidelity reviews.
- ACT team leader: supervises the team, leads daily meetings, and manages admissions and caseload.
- ACT team members: provide and document services as described in this policy.
`,
};
