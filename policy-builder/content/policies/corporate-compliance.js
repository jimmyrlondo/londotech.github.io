export default {
  id: 'corporate-compliance',
  number: '1.04',
  section: 'ASPIRE',
  standard: '1.A',
  topic: 'Leadership',
  title: 'Corporate Compliance Program',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.A', topic: 'Corporate compliance program', heading: 'Compliance Program Elements' },
    { standard: '1.A', topic: 'Designated compliance officer', heading: 'Compliance Officer' },
    { standard: '1.A', topic: 'Preventing fraud, waste, and abuse', heading: 'Preventing Fraud, Waste, and Abuse' },
    { standard: '1.A', topic: 'Billing and documentation integrity', heading: 'Billing Integrity' },
    { standard: '1.A', topic: 'Exclusion screening', heading: 'Exclusion Screening' },
    { standard: '1.A', topic: 'Reporting compliance concerns', heading: 'Reporting Concerns' },
    { standard: '1.A', topic: 'Investigation and corrective action', heading: 'Investigation and Corrective Action' },
    { standard: '1.A', topic: 'Compliance training', heading: 'Training' },
    { standard: '1.A', topic: 'Compliance risk assessment', heading: 'Annual Compliance Risk Assessment' },
  ],
  consultantNotes: 'Verify the state Medicaid exclusion/termination list name and URL for the agency\'s state (for Ohio, the ODM Provider Exclusion and Suspension List). Monthly screening is the common Medicaid expectation; confirm against the state Medicaid provider agreement. Confirm the anonymous reporting mechanism actually exists (phone line, web form, or locked box) and fill in contact details in the posted notice. The 60-day overpayment refund rule comes from the federal Affordable Care Act; confirm state Medicaid timelines. Confirm the agency\'s approach to self-disclosure (OIG Self-Disclosure Protocol or state Medicaid Fraud Control Unit). Pre-billing audit sample size (suggested 5% or 10 records per program per quarter) should be tailored to volume.',
  body: `
## Purpose

This policy establishes the corporate compliance program of {{agency.name}}. The program prevents, detects, and corrects fraud, waste, abuse, and other violations of law, regulation, or payer requirements.

## Scope

This policy applies to all personnel, leadership{{#if agency.hasBoard}}, the {{agency.governingBody}}{{/if}}, and any contractor or vendor who furnishes, documents, or bills services on behalf of {{agency.name}}.

## Policy

{{agency.name}} is committed to billing only for services that were actually provided, medically or programmatically necessary, properly authorized, and accurately documented. {{agency.name}} complies with the federal False Claims Act, the Anti-Kickback Statute, the Stark Law where applicable, state Medicaid program rules, and the requirements of every payer.

## Procedures

### Compliance Program Elements

The compliance program includes:

- Written policies and a code of conduct.
- A designated compliance officer with direct access to top leadership{{#if agency.hasBoard}} and the {{agency.governingBody}}{{/if}}.
- Training and education for all personnel.
- Open lines of communication, including anonymous reporting.
- Routine auditing and monitoring.
- Consistent enforcement and discipline.
- Prompt response to detected problems, including corrective action and repayment.

### Compliance Officer

The {{roles.compliance.title}} oversees the compliance program and reports directly to the {{roles.executive.title}}{{#if agency.hasBoard}} and at least quarterly to the {{agency.governingBody}}. The {{roles.compliance.title}} may go directly to the chair of the {{agency.governingBody}} when a concern involves the {{roles.executive.title}}.{{else}}.{{/if}} The {{roles.compliance.title}} has authority to review any record and to interview any personnel member as part of compliance activities.

### Preventing Fraud, Waste, and Abuse

Examples of prohibited conduct include billing for services not provided, upcoding, billing duplicate units, altering or backdating records, falsifying time or attendance, billing while excluded, and offering or accepting anything of value for referrals. To prevent these, {{agency.name}}:

1. Limits access to billing functions in {{ops.ehrSystem || "the electronic health record"}} to authorized personnel.
2. Requires that service documentation be completed and signed before a claim is submitted.
3. Separates the duties of providing services, entering charges, and posting payments where staffing allows.
4. Reviews new or changed payer rules and communicates them to affected personnel.

### Billing Integrity

- The {{roles.finance.title}} confirms each claim matches a documented, authorized service delivered by a qualified, credentialed provider.
- The {{roles.compliance.title}} or designee audits a sample of claims against documentation each quarter, at least 5% of claims or 10 records per program, whichever is greater.
- Errors are corrected before or after billing, and patterns are traced to their cause.
- Overpayments are reported and returned to the payer within 60 days of being identified, or sooner if the payer requires it.
- Electronic visit verification data, where required, is reconciled to claims before billing.

### Exclusion Screening

The {{roles.hr.title}} screens every employee{{#if ops.volunteers}}, volunteer{{/if}}{{#if ops.students}}, student{{/if}}, contractor, vendor, and leadership member{{#if agency.hasBoard}}, and every member of the {{agency.governingBody}},{{/if}} against:

- The HHS Office of Inspector General List of Excluded Individuals and Entities (LEIE).
- The federal System for Award Management (SAM.gov) exclusions.
- The exclusion and termination list maintained by the state Medicaid agency.

Screening takes place before hire, appointment, or contract, and monthly thereafter. Results are documented and kept for at least {{compliance.retentionYears}} years. A confirmed match is reported to the {{roles.compliance.title}} the same day. The person is removed from any work connected to federal or state health care programs, and the {{roles.compliance.title}} determines whether any claims must be refunded and whether disclosure is required.

### Reporting Concerns

Personnel must report suspected compliance violations. Reports may be made to a supervisor, the {{roles.compliance.title}}, or the {{roles.executive.title}}, or anonymously through the compliance hotline or reporting form. The reporting options are posted at every location and explained in orientation. {{agency.name}} does not retaliate against anyone who reports in good faith, consistent with federal and state whistleblower protections.

### Investigation and Corrective Action

1. The {{roles.compliance.title}} logs every report and begins review within 3 business days.
2. The investigation may include record review, claims analysis, and interviews. Legal counsel is consulted when there is potential liability.
3. Findings and conclusions are documented. If a violation is substantiated, the {{roles.compliance.title}} develops a corrective action plan that may include repayment, retraining, system changes, and discipline.
4. When required, the {{roles.compliance.title}}, with the {{roles.executive.title}} and counsel, discloses the matter to the payer, the state Medicaid agency, or the OIG.
5. The {{roles.compliance.title}} follows up to confirm the corrective action worked.

### Training

All personnel complete compliance training within 30 days of hire and annually. Personnel who document or bill services receive additional training on documentation and billing rules for their program. Attendance is recorded by the {{roles.hr.title}}.

### Annual Compliance Risk Assessment

Each year the {{roles.compliance.title}} assesses compliance risks, using audit results, payer and government audit findings, OIG work plan priorities, and changes in services or regulations. The assessment ranks risks and sets the next year's audit plan. Results are reported to the {{roles.executive.title}}{{#if agency.hasBoard}} and the {{agency.governingBody}}{{/if}} and feed into the agency's risk management plan.

## Responsibilities

- {{roles.compliance.title}}: leads the compliance program.
- {{roles.finance.title}}: maintains accurate billing and claims processes.
- {{roles.hr.title}}: completes exclusion screening and tracks training.
- All personnel: follow compliance rules and report concerns.

## Related Documents

- Code of Ethics and Conduct policy
- Exclusion screening log
- Compliance audit plan and risk assessment
`,
};
