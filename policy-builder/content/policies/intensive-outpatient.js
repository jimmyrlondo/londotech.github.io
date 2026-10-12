export default {
  id: 'intensive-outpatient',
  number: '3.02',
  section: 'SPECIFIC',
  standard: 'BH 3',
  topic: 'Intensive Outpatient Treatment',
  title: 'Intensive Outpatient Treatment',
  manuals: ['BH'],
  appliesIf: 'program.bhPrograms contains "iop"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'BH 3', topic: 'Intensive Outpatient Treatment: program description', heading: 'Program Description' },
    { standard: 'BH 3', topic: 'Intensive Outpatient Treatment: admission criteria', heading: 'Admission Criteria' },
    { standard: 'BH 3', topic: 'Intensive Outpatient Treatment: service components and intensity', heading: 'Service Components' },
    { standard: 'BH 3', topic: 'Intensive Outpatient Treatment: staffing', heading: 'Staffing and Qualifications' },
    { standard: 'BH 3', topic: 'Intensive Outpatient Treatment: service delivery', heading: 'Service Delivery Procedures' },
    { standard: 'BH 3', topic: 'Intensive Outpatient Treatment: adolescents', heading: 'Adolescents', showIf: 'program.servesMinors' },
    { standard: 'BH 3', topic: 'Intensive Outpatient Treatment: coordination of care', heading: 'Coordination of Care' },
    { standard: 'BH 3', topic: 'Intensive Outpatient Treatment: transition and discharge', heading: 'Transition and Discharge Criteria' },
    { standard: 'BH 3', topic: 'Intensive Outpatient Treatment: outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Intensive Outpatient Treatment is a BH Section 3 core program; the section letter changes between manual years, so verify it in the current BH manual and update the crosswalk. The minimum intensity (at least 9 hours per week for adults and 6 for adolescents, usually 3 or more days per week) mirrors ASAM Level 2.1 and common Medicaid IOP definitions; confirm against the state IOP rule and payer contracts, which may set different minimums, maximum lengths of stay, or required group sizes. The 3-day attendance-review trigger and weekly team review are suggested defaults. If the IOP offers only mental health or only SUD services, delete the content that does not apply.',
  body: `
## Purpose

To describe how {{agency.name}} delivers intensive outpatient treatment: a structured, multi-day-per-week program for persons who need more support than routine outpatient care but can live safely in the community.

## Scope

This policy applies to the intensive outpatient program and to all personnel who deliver or supervise it. The general program policies in Section 2 also apply.

## Program Description

The intensive outpatient program (IOP) provides a scheduled program of group, individual, and family services on multiple days each week, so that persons served can keep working, attending school, or caring for family while in treatment. It also serves as a step-down from partial hospitalization, residential treatment, or inpatient care. Services are delivered at agency locations{{#if program.telehealth}} and, when clinically appropriate, by telehealth under Policy 2.11 Telehealth Services{{/if}}. Program hours are {{program.hours || "posted at each program location"}}. Groups follow a published weekly schedule.{{#if program.payers}} Services are funded through {{list program.payers}}, and personnel obtain any required prior authorization before admission or as soon as possible after it.{{/if}}

## Admission Criteria

A person is admitted to the IOP when:

- The assessment under Policy 2.03 Assessment of Persons Served shows symptoms or functional problems that need more structure than routine outpatient care{{#if program.sud}}, or the placement assessment supports an intensive outpatient level of care for a substance use disorder{{/if}}
- The person does not need 24-hour supervision or medical monitoring, and is not at imminent risk of harm that requires a higher level of care
- The person has a safe place to live and can get to sessions, or the agency has a plan to address transportation
- The person, or a parent or guardian when required, agrees to the program schedule

## Service Components

- A minimum of 9 hours of scheduled services per week for adults (6 for adolescents), usually on 3 or more days
- Group therapy and skills groups, such as coping skills, emotion regulation, relapse prevention, and illness self-management
- Individual sessions at least weekly to review the person-centered plan (Policy 2.04 Person-Centered Planning)
- Family or support-person sessions, with the person's consent
{{#if ops.prescribes}}- Psychiatric evaluation and medication management by agency prescribers under Policy 2.06 Medication Management
{{/if}}{{#if program.sud}}- Toxicology testing as described in the plan, naloxone education, and access to medication for substance use disorders on site or by referral
{{/if}}- Crisis and safety planning, with information on reaching help after hours, including 988

## Staffing and Qualifications

Each IOP group is led by a licensed clinician or by credentialed personnel under the supervision required by state rules. A licensed clinician serves as program lead and attends the weekly team review. Group size is kept small enough for each person to participate; the {{roles.clinical.title}} sets the maximum.

## Service Delivery Procedures

1. Each person receives a written weekly schedule and the program's expectations at admission.
2. Personnel record attendance at every session. A person who misses a session is contacted the same business day.
3. The treatment team reviews each person's progress at least weekly and adjusts the plan, intensity, or level of care.
4. When a person misses 3 scheduled days in a row or shows a rise in risk, the program lead meets with them to review the plan and whether IOP is still the right level of care.
5. Each service is documented in {{ops.ehrSystem || "the electronic health record"}} within the timeframe in Policy 2.08 Records of the Persons Served.

{{#if program.servesMinors}}## Adolescents

Adolescents attend groups separate from adults. The schedule is set around school hours, and with consent the program coordinates with the school on attendance and accommodations. Parents or guardians take part in family sessions at least every other week unless clinically contraindicated, and consent follows {{agency.stateName || "state"}} minor-consent law.

{{/if}}## Coordination of Care

With authorization, personnel coordinate with the referring provider, primary care, prescribers, and any court or probation officer involved, and begin arranging the next level of care well before discharge.{{#if compliance.part2}} Substance use treatment information is shared only with a consent that meets 42 CFR Part 2 (Policy 2.10 Confidentiality and Release of Information).{{/if}}

## Transition and Discharge Criteria

Transition follows Policy 2.05 Transition and Discharge. A person steps down to routine outpatient care when symptoms and functioning are stable enough that weekly services can maintain progress, and steps up to a more intensive level of care when risk or symptoms increase. Every transition includes a scheduled first appointment with the next provider before the person's last IOP day.

## Outcomes Measured

- Change on a standardized symptom or functioning measure at admission, every 30 days, and at discharge
- Attendance rate and completion rate
- Successful step-down, meaning the person attends a first appointment at the next level of care within 14 days
- Readmission to a higher level of care within 90 days of discharge
- Satisfaction of persons served

Results are reported to the {{roles.quality.title}} under Policy 1.23 Performance Measurement and Management.

## Responsibilities

The {{roles.clinical.title}} oversees the IOP and approves its curriculum and schedule. The program lead runs weekly team reviews and monitors attendance.
`,
};
