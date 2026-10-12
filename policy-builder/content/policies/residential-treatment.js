export default {
  id: 'residential-treatment',
  number: '3.07',
  section: 'SPECIFIC',
  standard: 'BH 3 / CYS 3',
  topic: 'Residential Treatment',
  title: 'Residential Treatment',
  manuals: ['BH', 'CYS'],
  appliesIf: 'program.bhPrograms contains "residential" or program.cysPrograms contains "residential"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'BH 3 / CYS 3', topic: 'Residential Treatment: program description', heading: 'Program Description' },
    { standard: 'BH 3 / CYS 3', topic: 'Residential Treatment: admission criteria', heading: 'Admission Criteria' },
    { standard: 'BH 3 / CYS 3', topic: 'Residential Treatment: therapeutic milieu and daily schedule', heading: 'Service Components' },
    { standard: 'BH 3 / CYS 3', topic: 'Residential Treatment: 24-hour staffing', heading: 'Staffing and Qualifications' },
    { standard: 'BH 3 / CYS 3', topic: 'Residential Treatment: house rules', heading: 'House Rules' },
    { standard: 'BH 3 / CYS 3', topic: 'Residential Treatment: searches and contraband', heading: 'Searches and Contraband' },
    { standard: 'BH 3 / CYS 3', topic: 'Residential Treatment: visitation, communication, and passes', heading: 'Visitation, Communication, and Passes' },
    { standard: 'BH 3 / CYS 3', topic: 'Residential Treatment: education for children and adolescents', heading: 'Education and Family Involvement', showIf: 'program.cysPrograms contains "residential" or program.populations contains "youth"' },
    { standard: 'BH 3 / CYS 3', topic: 'Residential Treatment: coordination, transition, and discharge', heading: 'Coordination, Transition, and Discharge' },
    { standard: 'BH 3 / CYS 3', topic: 'Residential Treatment: outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Residential Treatment is a Section 3 core program in both the BH and CYS manuals; verify current section letters. State residential licensing rules (and for youth, children\'s residential center or PRTF rules, which may include 42 CFR 483 Subpart G and the federal Family First Prevention Services Act QRTP requirements) usually set staff ratios, search rules, visitation rights, and education requirements; confirm each. Suggested defaults: awake overnight staffing, 1 to 6 daytime ratio for youth and 1 to 8 for adults, nursing assessment within 24 hours, family contact at least weekly for youth, 30-day plan review. Rules on restricting visits, phone calls, or mail must match the agency\'s rights policy and state law; restrictions on youth contact with family are usually limited to court orders or documented clinical risk. Strip searches are excluded by this template.',
  body: `
## Purpose

To describe how {{agency.name}} provides residential treatment: 24-hour, structured, therapeutic care in a supervised living environment for persons who cannot yet be served safely or effectively in a less intensive setting.

## Scope

This policy applies to the residential treatment program{{#if program.cysPrograms contains "residential"}}, including residential treatment for children and adolescents,{{/if}} and to all personnel who work in residential settings. The general program policies in Section 2 also apply.

## Program Description

The residential program provides treatment, supervision, and support 24 hours a day, 7 days a week, within a therapeutic community where daily living is part of treatment. The program serves persons whose behavioral health{{#if program.sud}} or substance use{{/if}} needs require round-the-clock structure.{{#if program.payers}} Services are funded through {{list program.payers}}, and personnel obtain any required authorization before admission.{{/if}}

## Admission Criteria

A person is admitted when the assessment (Policy 2.03 Assessment of Persons Served) shows that a less restrictive level of care has not worked or is not safe, the person does not need hospital-level medical or psychiatric care, the program can meet their needs, and the person (or parent or guardian) consents, or a court has ordered placement as permitted by law.

## Service Components

- **Therapeutic milieu.** Every interaction is treated as an opportunity for growth. Personnel model respectful communication, notice progress, and help residents practice new skills in real situations.
- **Daily schedule.** A posted schedule includes wake and meal times, individual and group therapy, skill-building, recreation, chores, free time, and quiet hours, with weekend schedules that keep structure and allow rest.
- **Clinical services.** Individual therapy at least weekly, group therapy most days, and family therapy as the plan calls for (Policy 2.04 Person-Centered Planning).
- **Health care.** A nursing assessment within 24 hours of admission, access to primary and dental care, and medication services under Policy 2.06 Medication Management.

## Staffing and Qualifications

Trained direct care personnel are present and awake at all hours. Daytime ratios are at least 1 staff member to {{#if program.cysPrograms contains "residential" or program.populations contains "youth"}}6 youth{{#if program.bhPrograms contains "residential"}} and 1 to 8 adults{{/if}}{{else}}8 residents{{/if}}, with higher staffing when acuity requires. A licensed clinician supervises treatment, and a nurse and prescriber are available on call 24 hours a day. Responses to crises follow Policy 2.07 Promoting Nonviolent Practices.

## House Rules

House rules are written in plain language, reviewed with each resident at admission, posted, and reviewed by residents at community meetings at least monthly. Rules focus on safety, respect, and participation. Responses to rule violations are educational and proportionate; they never include withholding food, sleep, hygiene, communication with an attorney or advocate, or treatment.

## Searches and Contraband

Contraband includes weapons, alcohol, illicit drugs, unprescribed medications, and items listed in the posted house rules. Personnel search belongings at admission and after passes, in the resident's presence and with two personnel when possible, and document each search. A search of a resident's room or person beyond belongings requires a documented safety reason and supervisor approval, and is done by personnel of the gender the resident prefers. Strip searches are not performed. Found contraband is secured, logged, and returned at discharge, given to a guardian, or turned over to law enforcement when illegal.

## Visitation, Communication, and Passes

Residents may receive visitors, make and receive private phone calls, and send and receive mail during posted hours. Any restriction is individualized, based on a documented clinical or safety reason or a court order, reviewed at least weekly, and explained to the resident. Therapeutic passes away from the program are part of the plan, approved by the treatment team, and followed by a debrief with the resident.

{{#if program.cysPrograms contains "residential" or program.populations contains "youth"}}## Education and Family Involvement

Every school-age resident attends school, either on site or in the community, under state and federal education law, including any individualized education program. The program enrolls the youth within 3 school days of admission. Parents or guardians are contacted at least weekly, take part in planning, and are invited to family therapy and visits unless a court order or documented safety risk prevents it. Suspected abuse or neglect is reported to {{compliance.cpsAgency || "the county child protective services agency"}} under Policy 1.21 Abuse, Neglect, and Exploitation.

{{/if}}## Coordination, Transition, and Discharge

The team reviews the plan at least every 30 days and begins discharge planning at admission. A resident transitions when they can continue progress at a less intensive level of care, with an aftercare appointment, a living arrangement, and medications in place before discharge, under Policy 2.05 Transition and Discharge.{{#if compliance.part2}} Substance use information is disclosed only with a consent that meets 42 CFR Part 2.{{/if}}

## Outcomes Measured

- Change on a standardized functioning measure at admission, every 30 days, and at discharge
- Planned discharges to a less restrictive setting
- Critical incidents{{#if ops.usesRestraint}} and emergency safety interventions{{/if}}
- Readmissions within 90 days
- Satisfaction of residents{{#if program.cysPrograms contains "residential" or program.populations contains "youth"}} and families{{/if}}

Results are reported to the {{roles.quality.title}} under Policy 1.23 Performance Measurement and Management.

## Responsibilities

The {{roles.clinical.title}} oversees residential treatment. The program manager maintains staffing, the daily schedule, and house rules. Direct care personnel, clinicians, and nurses provide and document care as described in this policy.
`,
};
