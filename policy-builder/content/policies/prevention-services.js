export default {
  id: 'prevention-services',
  number: '3.18',
  section: 'SPECIFIC',
  standard: 'BH 3',
  topic: 'Prevention',
  title: 'Prevention Services',
  manuals: ['BH'],
  appliesIf: 'program.bhPrograms contains "prevention"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'BH 3', topic: 'Prevention: program description and populations', heading: 'Program Description' },
    { standard: 'BH 3', topic: 'Prevention: community needs assessment and planning', heading: 'Needs Assessment and Planning' },
    { standard: 'BH 3', topic: 'Prevention: evidence-based strategies', heading: 'Selecting Evidence-Based Strategies' },
    { standard: 'BH 3', topic: 'Prevention: implementation and fidelity', heading: 'Implementation and Fidelity' },
    { standard: 'BH 3', topic: 'Prevention: personnel', heading: 'Staffing and Qualifications' },
    { standard: 'BH 3', topic: 'Prevention: participants and records', heading: 'Participants and Records' },
    { standard: 'BH 3', topic: 'Prevention: coordination with community partners', heading: 'Coordination' },
    { standard: 'BH 3', topic: 'Prevention: evaluation and outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Section reference is a best estimate: Prevention appears among the core program standards in Section 3 of the BH manual; verify the letter against the current manual. CARF applies some general program standards (assessment, individual plans) differently to prevention programs that serve groups or communities rather than enrolled persons; confirm which Section 2 standards apply and adjust the Scope paragraph. The Strategic Prevention Framework is SAMHSA\'s planning model and is named here only as a public framework. Suggested defaults: community needs assessment at least every 3 years, fidelity checks on at least 10 percent of sessions, pre and post surveys for curricula of 4 or more sessions. Confirm state prevention certification requirements (for Ohio, the Ohio Chemical Dependency Professionals Board prevention credentials) and any block grant or county board reporting system. Parental consent rules for youth surveys (for example, the federal Protection of Pupil Rights Amendment in schools) should be confirmed.',
  body: `
## Purpose

To describe how {{agency.name}} plans, delivers, and evaluates prevention services that reduce the risk of substance use, mental health problems, and related harms, and promote wellness in the community.

## Scope

This policy applies to all prevention personnel and supervisors. Because prevention serves groups and communities, most participants are not enrolled as persons served, and the individual assessment and planning requirements of Section 2 apply only when a participant is enrolled in an individual service. Confidentiality is covered in Policy 2.10 Confidentiality and Release of Information.

## Program Description

The prevention program serves {{#if program.servesMinors}}children, youth, {{/if}}families, schools, and community members, using universal strategies for whole populations, selective strategies for groups at higher risk, and indicated strategies for individuals showing early signs of risk. Services take place in schools, community centers, workplaces, places of worship, and online. Program staff are available {{program.hours || "during regular business hours"}}, and activities are scheduled to fit participants.

{{#if program.payers}}Prevention services are funded through {{list program.payers}}, and personnel follow each funder's reporting requirements.

{{/if}}## Needs Assessment and Planning

{{agency.name}} uses a recognized planning model, such as the Strategic Prevention Framework, to guide its work:

1. **Assess:** at least every 3 years, review local data on substance use, mental health, risk and protective factors, and community resources, with input from community members.
2. **Build capacity:** develop partnerships and train personnel and community members.
3. **Plan:** select priority problems and populations and write a logic model linking each strategy to the outcomes it should change.
4. **Implement:** deliver strategies as designed.
5. **Evaluate:** measure results and use them to improve.

Cultural relevance and long-term sustainability are considered at every step.

## Selecting Evidence-Based Strategies

Strategies are chosen from programs and practices with evidence of effectiveness for the population and problem, such as those listed in recognized evidence-based registries or reviews. When no proven program fits, the agency documents the theory and local evidence supporting its chosen approach. Strategies are adapted only in ways that keep their core elements, and every adaptation is documented.

## Implementation and Fidelity

Facilitators are trained in each curriculum before delivering it. Supervisors observe at least 10 percent of sessions, or follow the developer's fidelity tool when one exists, and record whether core elements, session count, and dosage were delivered as designed. Gaps lead to coaching and a written correction plan.

## Staffing and Qualifications

Prevention personnel meet the qualifications in their job description and hold any prevention credential required by the state or funder. All personnel complete training on cultural responsiveness, mandated reporting, and confidentiality. {{#if program.servesMinors}}Personnel working with youth pass background checks required for work with minors and are never alone with a youth in a closed space. {{/if}}{{#if ops.volunteers}}Volunteers follow Policy 1.17 Volunteers and Students. {{/if}}

## Participants and Records

Attendance and participation are recorded for each activity, using only the personal information needed. {{#if program.servesMinors}}Written parental consent is obtained before a minor takes part in ongoing programs or completes surveys, as required by law and funder rules. {{/if}}When a participant discloses a crisis, abuse, or a need for treatment, personnel follow Policy 1.21 Abuse, Neglect, and Exploitation where applicable and offer a warm referral to treatment or other services.

## Coordination

The program works with schools, coalitions, law enforcement, health systems, and other providers to align efforts and share data appropriately. Personnel take part in local prevention coalitions where they exist.

## Outcomes Measured

The program measures:

- Reach: number of participants and activities, by strategy
- Fidelity: share of sessions delivered as designed
- Short-term outcomes: changes in knowledge, attitudes, and skills, using pre and post surveys for multi-session curricula
- Community outcomes: changes in local indicators tracked in the needs assessment

Results are reviewed at least annually, reported to funders as required, and shared with the {{roles.quality.title}}.

## Responsibilities

- {{roles.clinical.title}}: oversees the prevention program and approves strategies.
- Prevention supervisors: monitor fidelity and data quality.
- Prevention personnel: deliver strategies and record participation and outcomes.
`,
};
