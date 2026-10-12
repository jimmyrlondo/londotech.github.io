export default {
  id: 'otp-diversion-control',
  number: '3.43',
  section: 'SPECIFIC',
  standard: 'OTP 2',
  topic: 'Opioid Treatment Program',
  title: 'OTP Diversion Control',
  manuals: ['OTP'],
  appliesIf: 'program.otpPrograms contains "otp"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'OTP 2', topic: 'OTP: diversion control plan', heading: 'Diversion Control Plan' },
    { standard: 'OTP 2', topic: 'OTP: diversion monitoring', heading: 'Monitoring' },
    { standard: 'OTP 2', topic: 'OTP: response to suspected diversion by persons served', heading: 'Responding to Suspected Diversion by a Person Served' },
    { standard: 'OTP 2', topic: 'OTP: suspected diversion by personnel', heading: 'Suspected Diversion by Personnel' },
    { standard: 'OTP 2', topic: 'OTP: personnel responsibilities for diversion control', heading: 'Responsibilities' },
  ],
  consultantNotes: 'CARF OTP manual numbering varies by year; "OTP 2" is a placeholder. Verify. VERIFY against current 42 CFR 8.12 (the 2024 rule keeps the requirement for a written diversion control plan as part of quality assurance, with specific measures to reduce diversion and assigned responsibility for medical and administrative staff), DEA rules (21 CFR 1301.76 on employee diversion reporting and 1301.74, theft or significant loss reported within 1 business day and on DEA Form 106), and state board of pharmacy and nursing board reporting rules. Quarterly plan review and the 24-hour internal reporting window are program choices; confirm. DEA restricts employing persons with certain drug-related convictions in positions with access to controlled substances (21 CFR 1301.76(a), waiver process); confirm with HR. Law enforcement reporting of a person served is limited by 42 CFR Part 2; only crimes on program premises or against program personnel may be reported without consent, and only limited information.',
  body: `
## Purpose

To prevent the diversion of medications for opioid use disorder from the opioid treatment program of {{agency.name}}, to detect diversion early, and to respond in a way that protects the community while keeping persons served in treatment.

## Scope

This policy applies to all controlled substances received, stored, dispensed, or wasted by the OTP, to all persons served who receive them, and to all personnel. It works together with Policy 3.41 OTP Medications and Dosing and Policy 3.42 OTP Take-Home Medication.

## Policy

{{agency.name}} maintains a written diversion control plan as part of its quality assurance program. Diversion is addressed first as a clinical concern for persons served. Diversion by personnel is a serious breach of conduct and of federal law.

## Procedures

### Diversion Control Plan

The {{roles.medical.title}} and the {{roles.compliance.title}} maintain the diversion control plan, which identifies the program's diversion risks and the controls for each, including:

- Physical security of the medication supply and dosing area
- Observed dosing practices, including confirming that each dose is swallowed or fully dissolved
- Take-home criteria, safe storage education, lockboxes, call-backs, and bottle returns
- Inventory counts, reconciliation, and audit of dosing system records
- Checks of the state prescription drug monitoring program
- Personnel screening, training, and separation of duties

The plan is reviewed at least quarterly with data from monitoring activities, and after any confirmed diversion, and is updated when risks change.

### Monitoring

The program monitors for diversion by:

- Reviewing call-back results, returned containers, and missed call-backs
- Reviewing drug test results for the absence of the prescribed medication, which may indicate the medication is not being taken
- Reconciling daily counts, dispensing records, and waste logs, and investigating every discrepancy
- Watching for warning signs in the dosing area, such as holding medication in the mouth, leaving quickly after dosing, or reports from the community
- Reviewing community reports and law enforcement inquiries, within the limits of confidentiality law

Monitoring results are reported to the {{roles.quality.title}} for trend review.

### Responding to Suspected Diversion by a Person Served

When diversion by a person served is suspected:

1. Personnel document the facts observed and notify the practitioner and counselor the same day.
2. The practitioner meets with the person, explains the concern, and listens to the person's account without judgment.
3. The practitioner and team decide on a clinical response, which may include more frequent observed dosing, reduced or suspended take-home doses, a change in medication or formulation, a dose review if diversion suggests the dose is too high, and added counseling.
4. The response and its rationale are documented, and the person is told what is needed to restore privileges.

Discharge is a last resort, considered only when the person's continued enrollment poses a serious risk to others and lesser measures have failed, and follows Policy 3.45 OTP Continuity of Care. Information about a person served is disclosed to law enforcement only as permitted by 42 CFR Part 2 (see Policy 2.10 Confidentiality and Release of Information).

### Suspected Diversion by Personnel

Personnel who suspect another worker of diverting medication report it to the {{roles.medical.title}} or the {{roles.compliance.title}} within 24 hours. The worker is removed from access to controlled substances during the investigation. Confirmed theft or significant loss is reported to the DEA within 1 business day of discovery and on the required DEA form, to the state board of pharmacy or licensing board as required, and handled as a critical incident (see Policy 1.14 Critical Incidents) and as a personnel matter.

## Responsibilities

The {{roles.medical.title}} is accountable for the clinical elements of the plan, and the {{roles.compliance.title}} for its administrative and reporting elements. Dosing nurses observe dosing and maintain counts. Counselors address diversion concerns therapeutically. The {{roles.hr.title}} screens personnel for positions with access to controlled substances as DEA rules require. All personnel complete diversion awareness training at hire and annually.
`,
};
