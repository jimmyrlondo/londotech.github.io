export default {
  id: 'otp-take-home-medication',
  number: '3.42',
  section: 'SPECIFIC',
  standard: 'OTP 2',
  topic: 'Opioid Treatment Program',
  title: 'OTP Take-Home Medication',
  manuals: ['OTP'],
  appliesIf: 'program.otpPrograms contains "otp"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'OTP 2', topic: 'OTP take-homes: clinical criteria', heading: 'Clinical Criteria' },
    { standard: 'OTP 2', topic: 'OTP take-homes: amounts by time in treatment', heading: 'Amounts by Time in Treatment' },
    { standard: 'OTP 2', topic: 'OTP take-homes: safe storage education and lockboxes', heading: 'Safe Storage and Packaging' },
    { standard: 'OTP 2', topic: 'OTP take-homes: call-backs and bottle returns', heading: 'Call-Backs and Bottle Returns' },
    { standard: 'OTP 2', topic: 'OTP take-homes: reduction and revocation', heading: 'Reducing or Revoking Take-Home Privileges' },
  ],
  consultantNotes: 'CARF OTP manual numbering varies by year; "OTP 2" is a placeholder. Verify. VERIFY EVERY REGULATORY SPECIFIC against current 42 CFR 8.12(i) (2024 rule) and SAMHSA guidance, and the SOTA, which may be stricter: (1) the 2024 rule replaced the old time-in-treatment schedule and the 8 point criteria with practitioner judgment considering factors such as absence of active substance use that would compromise safety, regular attendance, absence of serious behavioral problems at the clinic, absence of recent diversion, stability of the home and social relationships, ability to store medication safely, and whether the benefits outweigh the risks. Toxicology results alone may not be the sole basis to deny take-homes. (2) Maximum methadone take-home supply: up to 7 days during the first 14 days of treatment, up to 14 days from day 15 to 30, and up to 28 days from day 31; confirm current text. (3) Buprenorphine is not subject to the same limits; confirm. (4) Some states cap take-homes below federal limits or still use a schedule; confirm state rules. (5) Call-back frequency and response window (24 hours here) are program choices; set them. (6) Take-home decisions and rationale must be documented by the practitioner. SAMHSA COVID-era blanket exceptions are superseded by the 2024 rule.',
  body: `
## Purpose

To describe how the opioid treatment program of {{agency.name}} decides when a person served may take doses home, how much may be dispensed, and how the program supports safe storage and prevents diversion.

## Scope

This policy applies to all unsupervised (take-home) doses of methadone and buprenorphine dispensed by the OTP and to the {{roles.medical.title}}, program practitioners, dosing nurses, and counselors.

## Policy

Take-home doses support recovery by reducing the burden of daily clinic visits so that persons served can work, go to school, care for family, and live their lives. {{agency.name}} bases take-home decisions on individualized clinical judgment, weighs benefit against risk to the person and the community, and documents each decision. Take-home doses are never granted or withheld as a reward or punishment.

## Procedures

### Clinical Criteria

A program practitioner decides whether to approve take-home doses after considering, at minimum:

- Whether the person has active substance use that would make unsupervised doses unsafe
- Regularity of attendance for dosing and other services
- Absence of serious behavioral problems at the clinic
- Absence of known recent diversion
- Stability of the person's home environment and social relationships
- Ability to store medication safely at home, away from children and others
- Whether the benefit of fewer clinic visits outweighs the risk of unsupervised doses

Drug test results are one factor among many and are not the only basis for denying take-home doses. The person's counselor and dosing nurse may give input. The practitioner documents the factors considered, the decision, and the number of doses approved, and reviews the decision at least every 90 days and whenever circumstances change.

### Amounts by Time in Treatment

The number of methadone take-home doses does not exceed the federal maximum for the person's time in continuous treatment: up to 7 days of supply during the first 14 days, up to 14 days from day 15 through day 30, and up to 28 days from day 31 onward, or any lower limit set by the state. Amounts are increased gradually as stability is demonstrated. Temporary take-home doses for holidays, clinic closures, travel, illness, or emergencies may be approved under the same clinical criteria and are documented.

### Safe Storage and Packaging

Before receiving the first take-home dose, the person served receives education on safe storage, the danger of accidental ingestion by children, pets, and others, what to do in an overdose, and how to use naloxone, and signs an acknowledgment. Methadone is dispensed in child-resistant containers labeled with the program's name, address, and phone number and the person's name and dose. Persons receiving methadone take-home doses store them in a locked box, which the program provides or helps the person obtain, and bring the box to the clinic when requested.

### Call-Backs and Bottle Returns

To confirm that take-home doses are being used as prescribed, the program:

1. Conducts random call-backs, asking the person to return to the clinic within 24 hours with all remaining take-home doses and containers.
2. Requires empty take-home containers to be returned at the next clinic visit.
3. Checks returned containers and remaining doses against the dispensing record and documents the result.

A missed call-back, missing doses, or tampering is reviewed by the practitioner and handled under Policy 3.43 OTP Diversion Control.

### Reducing or Revoking Take-Home Privileges

The practitioner may reduce or suspend take-home doses when the clinical criteria are no longer met, such as after diversion, unsafe storage, a missed call-back without good cause, or a significant decline in stability. The practitioner explains the reason to the person, documents it, and sets out what is needed to restore take-home doses. The person may appeal the decision through Policy 1.20 Complaints and Grievances.

## Responsibilities

The {{roles.medical.title}} oversees take-home practice and reviews the call-back program. Practitioners make and document take-home decisions. Dosing nurses dispense, educate, and check returns. The {{roles.clinical.title}} reviews take-home outcomes as part of program quality monitoring.
`,
};
