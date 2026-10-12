export default {
  id: 'screening-access',
  number: '2.02',
  section: 'PROGRAM',
  standard: '2.B',
  topic: 'Screening and Access to Services',
  title: 'Screening and Access to Services',
  manuals: ['BH', 'ECS', 'AS', 'CYS', 'OTP'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '2.B', topic: 'Referral and screening', heading: 'Referral and Screening' },
    { standard: '2.B', topic: 'Eligibility and admission criteria', heading: 'Eligibility and Admission Criteria' },
    { standard: '2.B', topic: 'Timeliness and waitlist management', heading: 'Timeliness and Waitlist Management' },
    { standard: '2.B', topic: 'Persons found ineligible', heading: 'When a Person Is Not Eligible' },
    { standard: '2.B', topic: 'Orientation of persons served', heading: 'Orientation of Persons Served' },
    { standard: '2.B', topic: 'Informed consent and fees', heading: 'Informed Consent and Fees' },
    { standard: '2.B', topic: 'Minors and guardians', heading: 'Minors and Guardians', showIf: 'program.servesMinors' },
  ],
  consultantNotes: 'Standard letters follow the BH Section 2 numbering; letter assignments differ by manual and year. Timeframes used here (screening contact within 2 business days, eligibility decision within 5 business days, orientation completed by the first service or within 3 visits, waitlist contact every 30 days) are suggested defaults: confirm against payer contracts, state rules, and any OTP federal admission requirements (42 CFR 8.12). The orientation list should be matched against the orientation element list in the current manual for each program; CARF expects specific items (rights, grievance, emergency procedures, smoking policy, etc.). State law determines the age of consent for behavioral health and SUD treatment by minors; verify.',
  body: `
## Purpose

To provide fair, timely, and consistent access to services at {{agency.name}}, and to ensure each person served understands the program, its expectations, and their rights from the start.

## Scope

This policy applies to all programs of {{agency.name}} and to personnel who receive referrals, conduct screenings, make eligibility decisions, or orient new persons served.

## Policy

{{agency.name}} screens each referral promptly against written eligibility and admission criteria, applies those criteria the same way for everyone, and never denies services on the basis of race, color, religion, national origin, sex, sexual orientation, gender identity, age, disability, or source of payment except where a funding source lawfully limits eligibility. Every person admitted receives an orientation and gives informed consent before services begin, except in an emergency.

## Referral and Screening

Referrals are accepted from persons seeking services, family members, guardians, schools, physicians, courts, payers, and other community agencies. Each program description identifies its usual referral sources.

When a referral is received, personnel record the date and source, contact the person within 2 business days, and complete a screening that gathers enough information to decide whether the program can appropriately meet the person's needs. Screening identifies any urgent risk (such as risk of harm to self or others, medical instability, or loss of housing). A person with an urgent need is connected to emergency or crisis services immediately, without waiting for the screening process to finish.

## Eligibility and Admission Criteria

Each program maintains written eligibility and admission criteria that address the population served, the needs the program is designed to meet, required documentation (such as a diagnosis, disability determination, or funding authorization), and any exclusion criteria. Criteria are available to persons served and referral sources on request.

The {{roles.clinical.title}}, or a qualified designee, decides eligibility within 5 business days of a completed screening and documents the decision and the reasons for it.

## Timeliness and Waitlist Management

When an eligible person cannot begin services right away, {{agency.name}} places the person on a waitlist and:

- Explains the expected wait and how the waitlist works
- Offers referrals to other providers who may serve the person sooner
- Contacts the person at least every 30 days to confirm continued interest and check for changes in need or risk
- Prioritizes persons with urgent needs, as defined in the program description
- Tracks time from referral to first service as a performance measure reported to the {{roles.quality.title}}

## When a Person Is Not Eligible

If a person does not meet admission criteria, or the program cannot safely meet the person's needs, personnel explain the reason to the person (and referral source, with authorization) in plain language, document the reason in the screening record, and offer referrals to appropriate services. The person may ask the {{roles.clinical.title}} to review the decision. Screening records for persons not admitted are retained according to the records policy.

## Orientation of Persons Served

Each person served, and their family or guardian when appropriate, receives an orientation that is understandable to them. Orientation begins at the first service contact and is completed and documented within the first 3 service contacts. Orientation includes:

- An explanation of the services, program expectations, and hours of operation
- Rights of persons served, including how to file a complaint or grievance and the timeframes for response
- Confidentiality and its limits, including mandated reporting
- How the person participates in planning their services and in decisions about transition and discharge
- Any fees, financial obligations, and the agency's billing practices
- After-hours and emergency access, including crisis lines
- Emergency and evacuation procedures for the service location
- Program rules, including any restrictions that may apply and how they can be lifted
- Policies on smoking, tobacco, illegal or legal substances, and weapons
- Who the person's primary contact is and how to reach them
- How to give feedback, including satisfaction surveys

The person served signs or otherwise acknowledges that orientation was received, and a copy of the written orientation materials is offered.

## Informed Consent and Fees

Before services begin, personnel explain the proposed services, the expected benefits and risks, alternatives, and the person's right to refuse or withdraw consent at any time. Consent is documented in the record. Fees are explained in writing before services begin, including what a payer is expected to cover, what the person may owe, and how payment arrangements or financial hardship are handled. Changes in fees are communicated in advance.

{{#if program.servesMinors}}## Minors and Guardians

When the person served is a minor, the parent or legal guardian participates in screening, orientation, and consent, except where {{agency.state || "state"}} law allows a minor to consent to their own treatment. Personnel verify the identity and legal authority of the person signing for a minor, including custody orders where relevant, and keep a copy in the record. Minors are oriented in age-appropriate language even when a guardian provides consent.

{{/if}}When an adult served has a court-appointed guardian, personnel confirm the scope of the guardianship, obtain the guardian's consent within that scope, and still involve the person served in every decision to the fullest extent possible.

## Procedures

1. Personnel log each referral and make first contact within 2 business days.
2. Personnel complete the screening and route it to the {{roles.clinical.title}} or designee.
3. The eligibility decision is made and documented within 5 business days.
4. Eligible persons are scheduled or placed on the waitlist; ineligible persons receive an explanation and referrals.
5. Orientation, informed consent, and fee disclosure are completed and documented before or at the start of services.

## Responsibilities

The {{roles.clinical.title}} maintains admission criteria and oversees eligibility decisions. Intake personnel complete screening, orientation, and consent documentation. The {{roles.quality.title}} monitors timeliness and waitlist data.
`,
};
