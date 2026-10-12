export default {
  id: 'otp-medication-dosing',
  number: '3.41',
  section: 'SPECIFIC',
  standard: 'OTP 2',
  topic: 'Opioid Treatment Program',
  title: 'OTP Medications and Dosing',
  manuals: ['OTP'],
  appliesIf: 'program.otpPrograms contains "otp"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'OTP 2', topic: 'OTP: medications offered', heading: 'Medications Offered' },
    { standard: 'OTP 2', topic: 'OTP: induction', heading: 'Induction' },
    { standard: 'OTP 2', topic: 'OTP: dose adjustments', heading: 'Dose Adjustments' },
    { standard: 'OTP 2', topic: 'OTP: observed dosing and dispensing records', heading: 'Observed Dosing and Dispensing Records' },
    { standard: 'OTP 2', topic: 'OTP: missed doses', heading: 'Missed Doses' },
    { standard: 'OTP 2', topic: 'OTP: storage, security, and DEA requirements', heading: 'Storage, Security, and DEA Requirements' },
  ],
  consultantNotes: 'CARF OTP manual numbering varies by year; "OTP 2" is a placeholder. Verify. VERIFY EVERY REGULATORY SPECIFIC against current 42 CFR Part 8 (2024 rule), 21 CFR Parts 1301 and 1304 (DEA), the state board of pharmacy, and the SOTA: (1) the 2024 rule sets the initial methadone dose at no more than 50 mg on the first day unless the practitioner documents that a higher dose is clinically necessary (previously 30 mg plus 10 mg); confirm. (2) OTPs must offer access to all FDA-approved medications for OUD or document a referral pathway; confirm whether the program dispenses naltrexone or refers. (3) Missed-dose rule: the 3-day and 5-day thresholds are common practice (methadone tolerance loss), not federal law; the medical director should set these. (4) DEA: narcotic treatment program registration, safe or vault storage under 21 CFR 1301.72, dispensing records under 21 CFR 1304.24, biennial inventory, DEA Form 222 or CSOS for ordering, theft or significant loss reported to the DEA Field Office in writing within 1 business day of discovery and on DEA Form 106. (5) Dosing must be performed by a licensed practitioner or nurse or pharmacist as permitted by state law. Consider whether the agency needs a separate pharmacy services policy.',
  body: `
## Purpose

To ensure that medications for opioid use disorder (OUD) are started, adjusted, dispensed, documented, and secured at {{agency.name}} safely and in compliance with federal OTP rules, DEA requirements, and state law.

## Scope

This policy applies to all medications for OUD ordered or dispensed by the opioid treatment program and to the {{roles.medical.title}}, program practitioners, and dosing nurses or pharmacists. General medication practices follow Policy 2.06 Medication Management; this policy adds what is specific to the OTP.

## Policy

Medication is the core of OTP treatment. Doses are individualized, based on clinical judgment, and adjusted with the person served to reach and maintain stability, and dose decisions are never used as punishment or reward.

## Procedures

### Medications Offered

The program offers methadone and buprenorphine and provides or arranges access to extended-release naltrexone. The practitioner reviews each option with the person served, including the person's preferences and prior experience, and documents the choice. A person may change medications when clinically appropriate.

### Induction

Only an authorized practitioner orders the first dose and every dose change. For methadone, the first-day dose does not exceed the federal limit unless the practitioner documents in the record why a higher dose is clinically necessary. Personnel observe the person after early doses for sedation or withdrawal. Buprenorphine induction follows current clinical guidance on timing relative to the last opioid use, including approaches for persons using fentanyl. Before induction, the practitioner reviews the state prescription drug monitoring program and screens for other sedating medications and alcohol use.

### Dose Adjustments

Doses are adjusted gradually during stabilization, based on withdrawal symptoms, cravings, continued opioid use, side effects, and the person's own report. Dose increases are documented with the clinical reason. The practitioner reviews doses at each treatment plan review and when the person is pregnant, starts or stops interacting medications, or has a change in health. Dose levels are not capped by program policy.

### Observed Dosing and Dispensing Records

Doses taken at the clinic are dispensed by a licensed nurse or pharmacist, or another person authorized by state law, and taken under direct observation. Before each dose, the dosing nurse confirms the person's identity, checks for signs of intoxication or sedation, and withholds the dose and notifies the practitioner if the person appears impaired. Each dose is recorded at the time it is given, with the date, medication, amount, the dispenser's signature, and whether it was observed or taken home. Dispensing records and dosing system reconciliations are reviewed daily.

### Missed Doses

When a person misses doses, the dosing nurse notifies the counselor and practitioner. After missed doses on 3 or more consecutive days, the practitioner assesses the person before the next methadone dose and may reduce the dose because tolerance may have fallen; after 5 or more consecutive days, the practitioner considers re-induction. Personnel reach out to the person to learn why doses were missed and to offer support, and offer naloxone.

### Storage, Security, and DEA Requirements

The program maintains its DEA registration as a narcotic treatment program and its state approvals. Controlled substances are:

- Ordered only by authorized registrants using the required DEA ordering forms or electronic system
- Stored in a safe or vault that meets DEA security requirements, with access limited to authorized personnel
- Counted at the start and end of each dosing day by two authorized personnel, with discrepancies reported at once to the {{roles.medical.title}}
- Reconciled against receiving, dispensing, and waste records, with a biennial DEA inventory

Any theft or significant loss is reported to the DEA in writing within 1 business day of discovery and on the required DEA form, reported to state authorities as required, and handled as a critical incident (see Policy 1.14 Critical Incidents).

## Responsibilities

The {{roles.medical.title}} sets dosing protocols and supervises practitioners. Dosing nurses dispense, document, and secure medications. The {{roles.clinical.title}} and the {{roles.compliance.title}} review dosing audits and DEA compliance at least quarterly.
`,
};
