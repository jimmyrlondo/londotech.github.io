export default {
  id: 'funds-of-persons-served',
  number: '1.10',
  section: 'ASPIRE',
  standard: '1.F',
  topic: 'Financial Planning and Management',
  title: 'Funds of Persons Served',
  manuals: ['*'],
  appliesIf: 'ops.clientFunds',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.F', topic: 'Written authorization to manage funds', heading: 'Authorization' },
    { standard: '1.F', topic: 'Individual accounting of funds', heading: 'Individual Accounts' },
    { standard: '1.F', topic: 'Receipts and documentation', heading: 'Receipts and Transactions' },
    { standard: '1.F', topic: 'Reconciliation of funds', heading: 'Monthly Reconciliation' },
    { standard: '1.F', topic: 'Reporting to the person served', heading: 'Reporting to the Person Served' },
    { standard: '1.F', topic: 'Safeguards against misuse', heading: 'Prohibitions' },
  ],
  consultantNotes: 'Many states set detailed rules for provider-managed funds (for Ohio developmental disabilities services, see the OAC rule on personal funds of individuals; for licensed residential facilities there are separate rules). Confirm the state rule, cash-on-hand limits ($50 per person suggested), receipt thresholds, and whether funds must be kept in interest-bearing accounts. If the agency serves as SSA/SSI representative payee, add the SSA representative payee requirements (separate accounting, annual report to SSA). Confirm the discrepancy threshold that triggers an incident report ($20 or any unexplained shortage suggested) and whether a shortage must be reported to the state abuse/neglect authority as possible misappropriation.',
  body: `
## Purpose

This policy describes how {{agency.name}} safeguards and accounts for money and valuables that belong to persons served when the agency helps to manage them.

## Scope

This policy applies to all programs and personnel that hold, spend, or help persons served manage their personal funds{{#if program.residential}}, including residential sites{{/if}}.

## Policy

Funds belonging to persons served are their property. {{agency.name}} manages them only with written authorization, keeps them separate from agency funds, accounts for every transaction, and supports each person to manage their own money as independently as possible.

## Procedures

### Authorization

1. Before managing any funds, {{agency.name}} obtains written authorization from the person served{{#if program.servesMinors}}, or the parent or guardian of a minor{{/if}}, or the person's legal guardian or representative payee when one has been appointed.
2. The authorization states which funds the agency will manage, the scope of the agency's role, how the person can access their money, and how the person can withdraw the authorization at any time.
3. The person's service plan describes the support they need with money management and any goals to build their skills.
4. Authorizations are reviewed at least annually and when the person's needs change.

### Individual Accounts

- Each person's funds are accounted for in a separate ledger, in {{ops.ehrSystem || "the electronic health record"}} or a dedicated record, showing every deposit, withdrawal, and running balance.
- Funds are never commingled with agency funds or with other persons' funds. If funds are held in a pooled bank account, the account is titled as held for persons served and each person's share is tracked individually.
- Any interest earned belongs to the person.
- Cash kept on site is limited to a small amount for day-to-day needs (no more than $50 per person unless the plan says otherwise), kept in a locked box with access restricted to designated personnel.

### Receipts and Transactions

1. Every withdrawal or purchase is recorded on the person's ledger on the day it occurs, with the date, amount, purpose, and the initials of the personnel member involved.
2. Receipts are obtained for all purchases and attached to the ledger. If a receipt cannot be obtained, a written explanation is signed by the personnel member and a witness.
3. The person served signs or initials to acknowledge cash they receive, when able.
4. Purchases are made for the person's benefit and in line with their choices and plan. Purchases above $100 are approved in advance by the person and a supervisor.

### Monthly Reconciliation

Each month, a supervisor or a member of the finance team who does not routinely handle the person's funds reconciles each ledger against cash on hand, bank statements, and receipts, and signs the reconciliation. Any discrepancy is reported to the {{roles.finance.title}} the same day, investigated, and documented through the incident reporting process. An unexplained shortage is treated as possible misappropriation and reported to {{compliance.abuseReportingAgency}} as required.

### Reporting to the Person Served

At least quarterly, and at any time on request, the person served{{#if program.servesMinors}} (or parent or guardian){{/if}} and any legal guardian or payee receive a written statement showing deposits, withdrawals, and the current balance, explained in a way the person understands. When services end, the remaining balance and all records are returned within 30 days with a final accounting.

### Prohibitions

Personnel may not:

- Borrow, lend, or use the money or property of a person served for any reason.
- Commingle the funds of a person served with their own or the agency's funds.
- Accept gifts of money or property from a person served.
- Charge persons served for items or services the agency is required to provide.
- Use a person's funds for staff meals, gas, or activities unless the expense is for the person's own share.

Violations result in corrective action up to and including termination and referral to law enforcement.

## Responsibilities

- {{roles.finance.title}}: oversees the system for managing funds and reviews reconciliations.
- Program supervisors: complete or review monthly reconciliations and train personnel.
- Personnel: record every transaction accurately and keep funds secure.

## Related Documents

- Authorization to manage personal funds form
- Individual funds ledger
- Monthly reconciliation form
`,
};
