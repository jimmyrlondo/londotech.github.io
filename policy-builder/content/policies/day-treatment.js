export default {
  id: 'day-treatment',
  number: '3.04',
  section: 'SPECIFIC',
  standard: 'BH 3',
  topic: 'Day Treatment',
  title: 'Day Treatment',
  manuals: ['BH'],
  appliesIf: 'program.bhPrograms contains "dayTreatment"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'BH 3', topic: 'Day Treatment: program description', heading: 'Program Description' },
    { standard: 'BH 3', topic: 'Day Treatment: admission criteria', heading: 'Admission Criteria' },
    { standard: 'BH 3', topic: 'Day Treatment: service components', heading: 'Service Components' },
    { standard: 'BH 3', topic: 'Day Treatment: staffing', heading: 'Staffing and Qualifications' },
    { standard: 'BH 3', topic: 'Day Treatment: service delivery', heading: 'Service Delivery Procedures' },
    { standard: 'BH 3', topic: 'Day Treatment: children and adolescents', heading: 'Children and Adolescents', showIf: 'program.servesMinors' },
    { standard: 'BH 3', topic: 'Day Treatment: coordination of care', heading: 'Coordination of Care' },
    { standard: 'BH 3', topic: 'Day Treatment: transition and discharge', heading: 'Transition and Discharge Criteria' },
    { standard: 'BH 3', topic: 'Day Treatment: outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Day Treatment is a BH Section 3 core program; verify the current section letter and update the crosswalk. States define day treatment very differently (for adults it often overlaps with psychosocial rehabilitation or "community psychiatric supportive treatment" groups; for children it is often a school-linked therapeutic program), so confirm the state service definition, minimum hours, staff ratios, and any education requirements. The 3 days and 3 hours per day minimum, 90-day plan review, and 1 to 8 staff ratio are suggested defaults. If day treatment is delivered by the same team as partial hospitalization or IOP, make sure the program descriptions clearly distinguish the levels of care.',
  body: `
## Purpose

To describe how {{agency.name}} delivers day treatment: a structured, therapeutic day program that helps persons served reduce symptoms, build skills for daily life, and stay in their homes and communities.

## Scope

This policy applies to the day treatment program and to all personnel who deliver or supervise it. The general program policies in Section 2 also apply.

## Program Description

Day treatment provides a planned schedule of therapeutic and rehabilitative activities in a group setting, several days each week, for persons whose mental health{{#if program.sud}} or co-occurring{{/if}} needs call for more structure and support than outpatient care, but who do not need hospital-level care. Compared with partial hospitalization, day treatment is longer-term and focuses more on skill-building, recovery, and community functioning. The program operates at least 3 days a week for at least 3 hours a day. Program hours are {{program.hours || "posted at the program location"}}.{{#if program.payers}} Services are funded through {{list program.payers}}.{{/if}}

## Admission Criteria

A person is admitted to day treatment when:

- The assessment under Policy 2.03 Assessment of Persons Served shows a behavioral health condition that significantly affects daily functioning, such as self-care, relationships, school, or work
- Outpatient services alone have not been enough, or are not expected to be enough, to meet the person's goals
- The person does not need 24-hour supervision or daily medical monitoring
- The person, or a parent or guardian when required, wants to take part in a group program

## Service Components

- Group therapy and psychoeducation about the person's condition and recovery
- Skills training in areas such as coping, communication, problem solving, daily living, and managing money and time
- Recreational, expressive, and social activities chosen for a therapeutic purpose
- Individual sessions at least every other week to review the person-centered plan (Policy 2.04 Person-Centered Planning)
- Health and wellness activities, including nutrition, exercise, and tobacco cessation support
{{#if ops.medsAny}}- Medication education and monitoring, and support for medications taken during program hours, under Policy 2.06 Medication Management
{{/if}}- Connection to peer support, community resources, and natural supports

## Staffing and Qualifications

A licensed clinician directs the program and supervises all group content. Groups are led by licensed or credentialed personnel, with paraprofessional and peer support personnel assisting under supervision. The program maintains at least 1 staff member for every 8 persons served during program hours, with at least 2 personnel on site whenever persons served are present.

## Service Delivery Procedures

1. Each person receives a weekly schedule chosen with them from the program's activities, matched to their plan goals.
2. Attendance and participation are recorded for each activity, and personnel contact a person who misses a scheduled day by the next business day.
3. Personnel watch for changes in mood, behavior, or health during the day, and report concerns to the program director the same day.
4. The plan is reviewed with the person at least every 90 days, and sooner if progress stalls or risk increases.
5. Group and individual services are documented in {{ops.ehrSystem || "the electronic health record"}} within the timeframe in Policy 2.08 Records of the Persons Served.

{{#if program.servesMinors}}## Children and Adolescents

Children and adolescents are grouped by age and developmental level. With consent, the program coordinates closely with the child's school, and where the program operates during school hours it arranges educational services as required by state and federal education law. Parents or guardians receive regular updates and take part in family sessions and planning.

{{/if}}## Coordination of Care

With authorization, personnel coordinate with prescribers, primary care, case managers, residential providers, and families, and share relevant changes in functioning or risk.{{#if compliance.part2}} Substance use information is disclosed only with a consent that meets 42 CFR Part 2.{{/if}}

## Transition and Discharge Criteria

Transition follows Policy 2.05 Transition and Discharge. A person is considered for transition when:

- Plan goals are met and the person can maintain progress with less frequent services
- The person is ready for employment, education, or community activities that replace program days
- The person needs a more intensive level of care
- The person chooses to leave the program

The program helps each person plan how they will fill their days and stay connected after leaving.

## Outcomes Measured

- Change on a standardized functioning measure at admission, every 90 days, and at discharge
- Psychiatric hospitalizations and crisis episodes while enrolled
- Attendance rate
- Transitions to work, school, volunteering, or other community activity
- Satisfaction of persons served

Results are reported to the {{roles.quality.title}} under Policy 1.23 Performance Measurement and Management.

## Responsibilities

The {{roles.clinical.title}} oversees day treatment and approves the program schedule. The program director supervises personnel, staffing ratios, and plan reviews. Group leaders and clinicians deliver and document services.
`,
};
