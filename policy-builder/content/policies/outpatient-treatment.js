export default {
  id: 'outpatient-treatment',
  number: '3.01',
  section: 'SPECIFIC',
  standard: 'BH 3 / CYS 3',
  topic: 'Outpatient Treatment',
  title: 'Outpatient Treatment',
  manuals: ['BH', 'CYS'],
  appliesIf: 'program.bhPrograms contains "outpatient" or program.cysPrograms contains "outpatient"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'BH 3 / CYS 3', topic: 'Outpatient Treatment: program description', heading: 'Program Description' },
    { standard: 'BH 3 / CYS 3', topic: 'Outpatient Treatment: admission criteria', heading: 'Admission Criteria' },
    { standard: 'BH 3 / CYS 3', topic: 'Outpatient Treatment: service components', heading: 'Service Components' },
    { standard: 'BH 3 / CYS 3', topic: 'Outpatient Treatment: staffing', heading: 'Staffing and Qualifications' },
    { standard: 'BH 3 / CYS 3', topic: 'Outpatient Treatment: access, engagement, and missed appointments', heading: 'Service Delivery Procedures' },
    { standard: 'BH 3 / CYS 3', topic: 'Outpatient Treatment: children, adolescents, and families', heading: 'Children, Adolescents, and Families', showIf: 'program.cysPrograms contains "outpatient" or program.populations contains "youth"' },
    { standard: 'BH 3 / CYS 3', topic: 'Outpatient Treatment: coordination of care', heading: 'Coordination of Care' },
    { standard: 'BH 3 / CYS 3', topic: 'Outpatient Treatment: transition and discharge', heading: 'Transition and Discharge Criteria' },
    { standard: 'BH 3 / CYS 3', topic: 'Outpatient Treatment: outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Core program standards sit in Section 3 of both the BH and CYS manuals, but the letter for Outpatient Treatment changes between manual years (it has appeared near the end of the BH alphabetical list, around 3.P to 3.R); verify the exact section letter in the current BH and CYS manuals and update the crosswalk. Suggested defaults to confirm against state licensing rules and payer contracts: first appointment offered within 10 business days of a routine request and within 2 business days of an urgent one; missed-appointment outreach within 1 business day (same day for persons at elevated risk); closure after 60 days without contact following documented outreach; standardized measures every 90 days. The 9 hours (adult) and 6 hours (adolescent) weekly ceiling reflects ASAM Level 1 for SUD programs; mental health outpatient may have no ceiling. Confirm the state minor-consent age for mental health and SUD treatment and name it in the Children section.',
  body: `
## Purpose

To describe how {{agency.name}} delivers outpatient treatment so that persons served receive timely, individualized, evidence-informed services in the least restrictive setting that meets their needs.

## Scope

This policy applies to the outpatient treatment program{{#if program.cysPrograms contains "outpatient"}}, including outpatient services for children, adolescents, and their families,{{/if}} and to all personnel who deliver or supervise outpatient services. The general program policies in Section 2 also apply.

## Program Description

Outpatient treatment provides scheduled individual, group, and family services to persons who live in the community and whose needs can be met safely with regular appointments. Services are delivered at agency locations{{#if program.telehealth}} and by telehealth through {{ops.telehealthPlatform || "the agency's approved telehealth platform"}} under Policy 2.11 Telehealth Services{{/if}}. Hours of service are {{program.hours || "posted at each program location"}}.{{#if program.payers}} Services are funded through {{list program.payers}}, and personnel verify coverage and any authorization requirements before or at the first appointment.{{/if}}

## Admission Criteria

A person is admitted to outpatient treatment when:

- Screening under Policy 2.02 Screening and Access to Services shows a mental health{{#if program.sud}}, substance use,{{/if}} or behavioral concern within the program's scope
- The person is stable enough to be served safely with scheduled appointments and is not at imminent risk that requires a more intensive level of care
- The person, or a parent or guardian when required, agrees to participate
{{#if program.sud}}- For substance use services, the placement assessment supports an outpatient level of care
{{/if}}
Persons who do not meet these criteria are referred to an appropriate level of care, and the referral is documented.

## Service Components

Based on the assessment (Policy 2.03 Assessment of Persons Served) and the person-centered plan (Policy 2.04 Person-Centered Planning), outpatient services may include:

- Individual, group, and family therapy using evidence-based approaches matched to the person's needs, such as cognitive behavioral therapy, motivational interviewing, and trauma-focused treatment
- Suicide and risk screening at admission and whenever clinically indicated, using a standardized tool
{{#if ops.prescribes}}- Psychiatric evaluation and medication management by agency prescribers, under Policy 2.06 Medication Management
{{/if}}{{#if program.sud}}- Substance use counseling, relapse prevention, toxicology testing when it is part of the plan, naloxone education, and referral for medication for substance use disorders when indicated
{{/if}}- Information on how to reach help outside program hours, including the 988 Suicide and Crisis Lifeline

## Staffing and Qualifications

Assessment and therapy are provided by licensed clinicians acting within their scope of practice, or by credentialed personnel under the supervision required by state rules. Clinical supervisors meet with each clinician at least monthly and review caseload size against acuity.{{#if program.cysPrograms contains "outpatient"}} Personnel serving children and adolescents have training in child development, family systems, and evidence-based treatment for youth.{{/if}}

## Service Delivery Procedures

1. A first appointment is offered within 10 business days of a routine request and within 2 business days of an urgent request.
2. The clinician completes the assessment and plan within the timeframes in Policies 2.03 and 2.04 and sets the frequency of sessions in the plan.
3. When a person misses an appointment, personnel attempt contact within 1 business day, or the same day when the person is at elevated risk, and document the outreach.
4. After two consecutive missed appointments, the clinician reviews engagement with the person and adjusts the plan, schedule, or modality.
5. Each service is documented in {{ops.ehrSystem || "the electronic health record"}} within the timeframe in Policy 2.08 Records of the Persons Served.

{{#if program.cysPrograms contains "outpatient" or program.populations contains "youth"}}## Children, Adolescents, and Families

For a minor, a parent or legal guardian consents to treatment unless {{agency.stateName || "state"}} law allows the youth to consent on their own, and the record documents custody and who may consent. Parents, guardians, and caregivers are invited into planning and sessions as the youth's treatment allows. With consent, personnel coordinate with the youth's school. Suspected child abuse or neglect is reported to {{compliance.cpsAgency || "the county child protective services agency"}} under Policy 1.21 Abuse, Neglect, and Exploitation.

{{/if}}## Coordination of Care

With the person's authorization, personnel coordinate with primary care providers, prescribers, other behavioral health providers, and community supports, and document each contact.{{#if compliance.part2}} Information about substance use treatment is disclosed only with a consent that meets 42 CFR Part 2, under Policy 2.10 Confidentiality and Release of Information.{{/if}}

## Transition and Discharge Criteria

Transition and discharge follow Policy 2.05 Transition and Discharge. In this program, a person is considered for transition or discharge when:

- Plan goals are met and the person is ready to continue with natural or community supports
- The person needs a more intensive level of care, or can step down to a less intensive service
- The person chooses to end services
- There has been no contact for 60 days despite documented outreach

## Outcomes Measured

The program tracks, at minimum:

- Change on a standardized symptom or functioning measure, given at admission, every 90 days, and at discharge
- Time from first request to first appointment
- Attendance and early dropout
- Satisfaction of persons served{{#if program.cysPrograms contains "outpatient"}} and of families{{/if}}

Results are reported to the {{roles.quality.title}} under Policy 1.23 Performance Measurement and Management.

## Responsibilities

The {{roles.clinical.title}} oversees the program and approves the evidence-based practices used. Clinical supervisors monitor access, documentation, and caseloads.
`,
};
