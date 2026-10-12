export default {
  id: 'withdrawal-management',
  number: '3.08',
  section: 'SPECIFIC',
  standard: 'BH 3',
  topic: 'Withdrawal Management (Detoxification)',
  title: 'Withdrawal Management',
  manuals: ['BH'],
  appliesIf: 'program.bhPrograms contains "withdrawal"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'BH 3', topic: 'Withdrawal Management: program description and level of care', heading: 'Program Description' },
    { standard: 'BH 3', topic: 'Withdrawal Management: admission criteria', heading: 'Admission Criteria' },
    { standard: 'BH 3', topic: 'Withdrawal Management: service components', heading: 'Service Components' },
    { standard: 'BH 3', topic: 'Withdrawal Management: medical oversight and staffing', heading: 'Staffing and Medical Oversight' },
    { standard: 'BH 3', topic: 'Withdrawal Management: withdrawal scales and vital signs monitoring', heading: 'Monitoring Withdrawal' },
    { standard: 'BH 3', topic: 'Withdrawal Management: transfer to a higher level of care', heading: 'Transfer Criteria' },
    { standard: 'BH 3', topic: 'Withdrawal Management: adolescents', heading: 'Adolescents', showIf: 'program.servesMinors' },
    { standard: 'BH 3', topic: 'Withdrawal Management: linkage to ongoing treatment', heading: 'Coordination and Linkage to Ongoing Treatment' },
    { standard: 'BH 3', topic: 'Withdrawal Management: outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Withdrawal Management (Detoxification) is a BH Section 3 core program; verify the current section letter. This template assumes a residential or clinically managed/medically monitored setting (ASAM Level 3.2-WM or 3.7-WM); an ambulatory program (1-WM or 2-WM) needs the daily-visit and home-support language adjusted. CIWA-Ar and COWS thresholds and monitoring frequencies here are suggested defaults (CIWA-Ar or COWS every 4 hours for the first 72 hours, every 1 to 2 hours when scores are 10 or more or rising, prescriber notification at CIWA-Ar 15+ or COWS 13+, transfer at CIWA-Ar 20+ unresponsive to treatment); the medical director must approve the actual protocol and thresholds. Confirm state licensing rules for nurse staffing, physician availability, and whether buprenorphine induction is offered (prescribers need a DEA registration; the X-waiver no longer exists). A withdrawal program requires medication involvement; if the profile says the agency has no medication involvement, resolve this with the agency. Part 2 almost certainly applies.',
  body: `
## Purpose

To describe how {{agency.name}} provides safe, humane, medically supervised withdrawal management and connects every person served to ongoing treatment for their substance use disorder.

## Scope

This policy applies to the withdrawal management program and to all personnel who work in it. The general program policies in Section 2 also apply.

## Program Description

Withdrawal management helps persons who are physically dependent on alcohol, opioids, sedatives, or other substances withdraw safely, with medical monitoring and medications that reduce discomfort and risk. The program operates 24 hours a day and accepts admissions on a schedule set by the {{roles.medical.title}}. Withdrawal management is the start of recovery, not a complete treatment, so linkage to ongoing care begins at admission.{{#if program.payers}} Services are funded through {{list program.payers}}, and personnel obtain any required authorization as soon as possible after admission.{{/if}}

## Admission Criteria

A person is admitted when they are experiencing or are at risk of withdrawal that needs medical monitoring, the placement assessment supports this level of care, and they consent to admission. A person is referred to a hospital instead when they show signs of a medical or psychiatric emergency, including a history of withdrawal seizures or delirium with current high risk, unstable vital signs, or a serious acute illness.

## Service Components

- A nursing assessment, vital signs, and baseline withdrawal score at admission
- A medical evaluation by a physician or other prescriber
- Medications to manage withdrawal under the {{roles.medical.title}}'s approved protocols and Policy 2.06 Medication Management
- Offer of medication for opioid or alcohol use disorder, started on site or by referral
- Hydration, nutrition, rest, and a calm environment
- Motivational counseling, education on overdose risk after withdrawal, and naloxone at discharge
- Screening for co-occurring mental health conditions and suicide risk

## Staffing and Medical Oversight

A physician {{#if ops.prescribes}}employed by{{else}}under contract with{{/if}} {{agency.name}} serves as {{roles.medical.title}}, approves all withdrawal protocols, and is available by phone 24 hours a day. Nursing personnel are on site at all times when persons are in active withdrawal. Direct care personnel are trained to recognize worsening withdrawal and to give naloxone. Counselors provide engagement and linkage services.

## Monitoring Withdrawal

Nurses use standardized, validated withdrawal scales: the CIWA-Ar for alcohol and sedative withdrawal and the COWS for opioid withdrawal, or other scales the {{roles.medical.title}} approves.

1. Vital signs and a withdrawal score are taken at admission and at least every 4 hours for the first 72 hours, then as the protocol directs.
2. Scores and vital signs are checked more often, at least every 1 to 2 hours, when scores are high or rising.
3. The nurse notifies the prescriber when a score or vital sign passes the threshold in the approved protocol.
4. Each score, vital sign, medication given, and the person's response is documented in {{ops.ehrSystem || "the electronic health record"}}.

## Transfer Criteria

Personnel call 911 or arrange transfer to a hospital when a person has a seizure, hallucinations or confusion suggesting delirium, chest pain, breathing difficulty, unstable vital signs outside protocol limits, withdrawal that does not respond to protocol medications, a suspected overdose, or imminent suicide risk. The nurse gives the receiving facility a verbal report and a copy of the medication and monitoring record.

{{#if program.servesMinors}}## Adolescents

When the program serves adolescents, a parent or guardian consents unless {{agency.stateName || "state"}} law allows the minor to consent to substance use treatment on their own, adolescents are housed separately from adults, and dosing protocols are approved by the {{roles.medical.title}} for adolescent use.

{{/if}}## Coordination and Linkage to Ongoing Treatment

From the first day, a counselor works with the person to choose the next step, such as residential, intensive outpatient, or outpatient treatment, medication for substance use disorder, or recovery housing. Before discharge, personnel schedule an intake with the next provider, ideally within 24 hours and no later than 7 days, and arrange transportation when needed.{{#if compliance.part2}} All disclosures follow 42 CFR Part 2 and Policy 2.10 Confidentiality and Release of Information.{{/if}}

## Transition and Discharge Criteria

A person is discharged when withdrawal signs have resolved or can be managed safely at a lower level of care, the prescriber approves, and a linkage plan is in place. A person who leaves against medical advice receives overdose and naloxone education, a referral, and a follow-up call within 24 hours. Transition follows Policy 2.05 Transition and Discharge.

## Outcomes Measured

- Completion of withdrawal management
- Transfers to a hospital, and their reasons
- Persons starting medication for substance use disorder
- Admission to the next level of care within 7 days of discharge
- Readmission to withdrawal management within 30 days

Results are reported to the {{roles.quality.title}} under Policy 1.23 Performance Measurement and Management.

## Responsibilities

The {{roles.clinical.title}} oversees the program, and the {{roles.medical.title}} oversees all medical care. Nurses monitor and document withdrawal. Counselors complete linkage to ongoing treatment.
`,
};
