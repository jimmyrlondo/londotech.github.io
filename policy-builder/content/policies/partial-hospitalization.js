export default {
  id: 'partial-hospitalization',
  number: '3.03',
  section: 'SPECIFIC',
  standard: 'BH 3',
  topic: 'Partial Hospitalization',
  title: 'Partial Hospitalization',
  manuals: ['BH'],
  appliesIf: 'program.bhPrograms contains "partial"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'BH 3', topic: 'Partial Hospitalization: program description', heading: 'Program Description' },
    { standard: 'BH 3', topic: 'Partial Hospitalization: admission criteria', heading: 'Admission Criteria' },
    { standard: 'BH 3', topic: 'Partial Hospitalization: service components', heading: 'Service Components' },
    { standard: 'BH 3', topic: 'Partial Hospitalization: medical and psychiatric oversight', heading: 'Staffing and Qualifications' },
    { standard: 'BH 3', topic: 'Partial Hospitalization: daily service delivery and risk monitoring', heading: 'Service Delivery Procedures' },
    { standard: 'BH 3', topic: 'Partial Hospitalization: adolescents', heading: 'Adolescents', showIf: 'program.servesMinors' },
    { standard: 'BH 3', topic: 'Partial Hospitalization: coordination of care', heading: 'Coordination of Care' },
    { standard: 'BH 3', topic: 'Partial Hospitalization: transition and discharge', heading: 'Transition and Discharge Criteria' },
    { standard: 'BH 3', topic: 'Partial Hospitalization: outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Partial Hospitalization is a BH Section 3 core program; verify the current section letter and update the crosswalk. The intensity used here (at least 20 hours per week, usually 5 days and 4 to 6 hours per day) follows common Medicare and Medicaid partial hospitalization definitions and ASAM Level 2.5; confirm against the state rule and payer contracts. Medicare PHP has specific physician certification and recertification rules (initial certification, then recertification on a set schedule) that should be added if Medicare is a payer. Psychiatric evaluation within 24 hours of admission (next business day) and daily nursing contact are suggested defaults. If the agency does not employ prescribers, name the contracted physician group in the program description. A partial program almost always involves medications; if the profile says the agency has no medication involvement, this needs resolving with the agency.',
  body: `
## Purpose

To describe how {{agency.name}} delivers partial hospitalization: a time-limited, medically supervised day program that offers hospital-level structure while the person served lives at home.

## Scope

This policy applies to the partial hospitalization program (PHP) and to all personnel who deliver or supervise it. The general program policies in Section 2 also apply.

## Program Description

The PHP serves persons with acute psychiatric{{#if program.sud}} or co-occurring substance use{{/if}} symptoms who would otherwise need inpatient care, or who are stepping down from an inpatient stay. The program runs at least 5 days a week for 4 to 6 hours a day. Program hours are {{program.hours || "posted at the program location"}}. Stays are short and focused on stabilization and a safe return to less intensive care.{{#if program.payers}} Services are funded through {{list program.payers}}; personnel obtain prior authorization and any required physician certification before or at admission.{{/if}}

## Admission Criteria

A person is admitted to the PHP when:

- A physician or other licensed practitioner determines that the person needs daily, structured treatment to avoid hospitalization or to step down safely from it
- The person is medically stable and does not need 24-hour nursing or supervision
- The person has a safe place to stay overnight and a support person or plan for evenings and weekends
- The person, or a parent or guardian when required, agrees to attend the daily schedule

## Service Components

- A daily structured schedule of group therapy, skills training, and psychoeducation
- Individual therapy at least twice weekly
- Psychiatric evaluation and medication management, with medication education under Policy 2.06 Medication Management
- Daily nursing contact to monitor symptoms, side effects, and physical health
- Family sessions, with the person's consent
- A written safety plan, reviewed at least weekly, that covers evenings, weekends, and how to reach help, including 988
{{#if program.sud}}- Substance use treatment integrated into the daily schedule, with toxicology testing and medication for substance use disorders when indicated
{{/if}}
## Staffing and Qualifications

A psychiatrist or other physician {{#if ops.prescribes}}employed by{{else}}under contract with{{/if}} {{agency.name}} serves as {{roles.medical.title}} of the PHP and is available by phone during all program hours. Registered nurses provide daily nursing services. Therapy is provided by licensed clinicians. The treatment team includes, at minimum, the physician, a nurse, and the primary clinician.

## Service Delivery Procedures

1. A psychiatric evaluation is completed within 24 hours of admission, or by the next business day.
2. The person-centered plan (Policy 2.04 Person-Centered Planning) is developed within 3 program days and reviewed by the full treatment team at least weekly.
3. Personnel check risk at the start and end of each program day. Any rise in risk is reported to the primary clinician and the physician before the person leaves.
4. When a person does not arrive, personnel call the same morning and follow the safety plan if the person cannot be reached.
5. A person whose condition worsens so that they need inpatient care is evaluated by the physician and transferred with a warm handoff to the receiving facility. When there is imminent danger, personnel call 911.
6. Services are documented daily in {{ops.ehrSystem || "the electronic health record"}}.

{{#if program.servesMinors}}## Adolescents

Adolescents are served in a separate group. With consent, the program arranges educational services or coordinates with the youth's school so the youth does not fall behind. Parents or guardians attend family sessions at least weekly and take part in safety planning.

{{/if}}## Coordination of Care

Personnel coordinate admissions with referring hospitals and emergency departments, share daily progress with outpatient providers when authorized, and schedule the first post-discharge appointment before the person's last day.{{#if compliance.part2}} Substance use information is disclosed only with a consent that meets 42 CFR Part 2.{{/if}}

## Transition and Discharge Criteria

Transition follows Policy 2.05 Transition and Discharge. A person steps down to intensive outpatient or outpatient care when symptoms are stable, the safety plan is working, and daily structure is no longer needed. A person is transferred to inpatient care when they cannot be kept safe between program days. The physician approves each discharge.

## Outcomes Measured

- Change on a standardized symptom measure at admission, weekly, and at discharge
- Inpatient admission during the PHP stay and within 30 days after discharge
- Attendance at the first post-discharge appointment within 7 days
- Average length of stay
- Satisfaction of persons served

Results are reported to the {{roles.quality.title}} under Policy 1.23 Performance Measurement and Management.

## Responsibilities

The {{roles.clinical.title}} oversees the PHP. The {{roles.medical.title}} provides medical oversight and approves admissions and discharges. Nurses and clinicians deliver and document services as described in this policy.
`,
};
