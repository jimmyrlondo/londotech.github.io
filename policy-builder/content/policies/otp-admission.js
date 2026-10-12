export default {
  id: 'otp-admission',
  number: '3.40',
  section: 'SPECIFIC',
  standard: 'OTP 2',
  topic: 'Opioid Treatment Program',
  title: 'Opioid Treatment Program Admission',
  manuals: ['OTP'],
  appliesIf: 'program.otpPrograms contains "otp"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'OTP 2', topic: 'OTP admission: eligibility', heading: 'Eligibility' },
    { standard: 'OTP 2', topic: 'OTP admission: screening and medical examination', heading: 'Admission Screening and Medical Examination' },
    { standard: 'OTP 2', topic: 'OTP admission: informed consent', heading: 'Informed Consent' },
    { standard: 'OTP 2', topic: 'OTP admission: prevention of dual enrollment', heading: 'Preventing Dual Enrollment' },
    { standard: 'OTP 2', topic: 'OTP admission: interim treatment', heading: 'Interim Treatment' },
    { standard: 'OTP 2', topic: 'OTP admission: persons under 18', heading: 'Admission of Persons Under 18' },
  ],
  consultantNotes: 'CARF OTP manual section numbering varies by year; "OTP 2" is a placeholder for the OTP-specific admission standards. Verify. VERIFY EVERY REGULATORY SPECIFIC against current 42 CFR Part 8 (final rule published February 2, 2024, effective April 2, 2024, compliance date October 2, 2024), current SAMHSA guidance, and the State Opioid Treatment Authority (SOTA): (1) the 2024 rule removed the 1-year history of addiction requirement; eligibility is an OUD diagnosis under current DSM criteria, and the rule allows admission of persons at high risk of recurrence (for example after release from incarceration or pregnancy) without current physiological dependence at practitioner discretion. (2) Initial screening exam before the first dose and a full medical exam within 14 days of admission; the screening exam may be done by telehealth (audio-visual for methadone; audio-only allowed for buprenorphine when audio-visual is unavailable), subject to state rules and DEA telemedicine rules. (3) Persons under 18: the 2024 rule removed the requirement for 2 documented unsuccessful treatment attempts; written consent of a parent or legal guardian is required unless state law permits minors to consent; confirm state law. (4) Interim treatment: allowed up to 180 days in a 12-month period when comprehensive treatment is unavailable within 14 days, with state approval; the 2024 rule extended interim treatment beyond public/nonprofit programs. Confirm state permission and the required counseling, drug testing, and transfer timelines. (5) Central registry use and the consent required depend on the state; some states have no registry. Federal rule also requires annual reassessment and a treatment plan within a set period; confirm against the person-centered planning policy.',
  body: `
## Purpose

To describe how the opioid treatment program (OTP) of {{agency.name}} determines eligibility, admits persons served safely and promptly, obtains informed consent, and prevents enrollment in more than one OTP at a time, in compliance with federal OTP rules, DEA requirements, and the rules of {{compliance.licensingAgency || "the state licensing agency"}} and the State Opioid Treatment Authority{{#if compliance.sota}} ({{compliance.sota}}){{/if}}.

## Scope

This policy applies to everyone seeking admission to the OTP and to the practitioners, nursing, and counseling personnel who admit them. In this policy and in Policies 3.41 through 3.45, the {{roles.medical.title}} is the licensed physician designated to lead the medical services of the OTP, who is responsible for those services and for compliance with federal and state OTP rules, and a "practitioner" is a physician or other prescriber authorized by federal and state law to order OTP medications. General screening, assessment, and orientation follow Policy 2.02 Screening and Access to Services and Policy 2.03 Assessment of Persons Served; this policy adds requirements specific to the OTP.

## Policy

{{agency.name}} offers timely access to medication for opioid use disorder (OUD) and treats OUD as a chronic medical condition. Admission decisions are made by an authorized practitioner on clinical grounds. No one is denied admission because of prior treatment episodes, co-occurring conditions, pregnancy, involvement with the justice system, or use of other medications for OUD.

## Procedures

### Eligibility

A person is eligible when an authorized practitioner documents a diagnosis of OUD using current diagnostic criteria. The practitioner may also admit a person who is at high risk of returning to opioid use, such as a person recently released from incarceration, a pregnant person, or a person who previously received OUD treatment, even without current physiological dependence, and documents the clinical rationale.

### Admission Screening and Medical Examination

Before the first dose, a practitioner completes a screening examination that confirms the diagnosis, reviews medical history, current medications, recent substance use, and pregnancy status, and identifies any condition that makes it unsafe to begin medication. The screening may be conducted by telehealth when federal, DEA, and state rules permit. A full medical examination, including the laboratory tests the {{roles.medical.title}} requires, is completed within 14 days of admission. The person's history, assessment findings, and the practitioner's admission decision are documented in {{ops.ehrSystem || "the electronic health record"}}.

### Informed Consent

Before treatment begins, the practitioner explains, in language the person understands, the medications available and their risks and benefits, alternatives (including other medications and treatment without medication), the program's rules for attendance, dosing, take-home medication, and drug testing, and the person's right to withdraw at any time. The person signs the federal and program consent to treatment. Consent to share information with the central registry and other providers is obtained under 42 CFR Part 2 (see Policy 2.10 Confidentiality and Release of Information).

### Preventing Dual Enrollment

Before admission, personnel check the state central registry, where one exists, and use any other method required by the State Opioid Treatment Authority{{#if compliance.sota}} ({{compliance.sota}}){{/if}} to confirm the person is not currently enrolled in another OTP. If the person is enrolled elsewhere, the program contacts that OTP, with consent, to arrange a transfer or guest dosing instead of a second enrollment. The registry is updated at admission and discharge.

### Interim Treatment

When the program cannot admit a person to comprehensive treatment within 14 days, and the state permits it, the program may offer interim treatment: medication with initial and periodic drug testing, overdose prevention education, and referral to other services, while the person waits for an opening. Interim treatment does not exceed the federal time limit, and the program transfers the person to comprehensive treatment as soon as an opening exists.

### Admission of Persons Under 18

A person under 18 is admitted only with the written consent of a parent or legal guardian, unless state law allows the minor to consent. The practitioner documents the clinical justification, and family involvement is encouraged when it is safe and the young person agrees.

## Responsibilities

The {{roles.medical.title}} is responsible for admission criteria and practitioner oversight, under the program leadership of the {{roles.clinical.title}}. Intake personnel complete registry checks and consents. The {{roles.compliance.title}} monitors compliance with federal and state OTP rules.
`,
};
