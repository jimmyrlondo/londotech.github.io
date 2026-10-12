export default {
  id: 'financial-management',
  number: '1.09',
  section: 'ASPIRE',
  standard: '1.F',
  topic: 'Financial Planning and Management',
  title: 'Financial Planning and Management',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.F', topic: 'Budget preparation with input', heading: 'Budgeting' },
    { standard: '1.F', topic: 'Comparison of actual to budget', heading: 'Monthly Financial Review' },
    { standard: '1.F', topic: 'Fiscal policies and internal controls', heading: 'Internal Controls and Segregation of Duties' },
    { standard: '1.F', topic: 'Billing and collections', heading: 'Billing and Collections' },
    { standard: '1.F', topic: 'Fee schedules', heading: 'Fee Schedules' },
    { standard: '1.F', topic: 'Review or audit of financial statements', heading: 'Annual Review or Audit' },
    { standard: '1.F', topic: 'Fundraising', heading: 'Fundraising', showIf: 'ops.fundraising' },
  ],
  consultantNotes: 'CARF requires an annual review or audit of financial statements by an independent accountant; whether a full audit is required depends on funding (federal Single Audit at $1,000,000 or more in federal expenditures under 2 CFR 200 as revised in 2024; state contract and state nonprofit thresholds vary). Confirm the threshold that applies and whether the agency obtains an audit or a review. Confirm check-signing limits (dual signature above $5,000 suggested) and petty cash limits. Confirm the budget variance threshold that triggers explanation (10% and $1,000 suggested). The Fundraising section only prints when the profile says the agency fundraises; CARF has fundraising-related items in 1.F, so verify against the current manual.',
  body: `
## Purpose

This policy describes how {{agency.name}} plans, manages, and safeguards its financial resources so that it can sustain services and meet its obligations.

## Scope

This policy applies to all financial activity of {{agency.name}} and to all personnel who budget, spend, bill, collect, or handle funds.

## Policy

{{agency.name}} manages its finances according to generally accepted accounting principles, written fiscal policies, and the requirements of funders and payers. The fiscal year begins {{agency.fiscalYearStart || "on the date set by leadership"}}. Financial decisions support the mission and strategic plan, and financial information is reported accurately and on time.

## Procedures

### Budgeting

1. At least 90 days before the start of each fiscal year, the {{roles.finance.title}} prepares a draft annual budget for each program and for the agency as a whole.
2. Program leaders and the leadership team provide input on staffing, service volume, and needed resources. Input from persons served and other stakeholders, gathered under the Stakeholder Input policy, is considered.
3. The budget reflects the strategic plan, the technology and accessibility plans, expected reimbursement rates, and known risks.
4. The budget is approved by {{#if agency.hasBoard}}the {{agency.governingBody}}{{else}}the {{roles.executive.title}} and the agency's ownership{{/if}} before the fiscal year begins.

### Monthly Financial Review

Each month, the {{roles.finance.title}} prepares financial statements comparing actual revenue and expenses to the budget, year to date and for the month. Variances of more than 10% and $1,000 on any line are explained in writing. The leadership team reviews the reports monthly and takes corrective action when results fall short. {{#if agency.hasBoard}}The {{agency.governingBody}} (or its finance committee) reviews financial statements at each regular meeting.{{else}}The {{roles.executive.title}} reports financial results to ownership at least quarterly.{{/if}}

### Fiscal Policies

Written fiscal procedures cover purchasing and approval limits, payroll, accounts payable, cash and banking, petty cash, fixed assets, travel and expense reimbursement, grant and contract accounting, and record retention. Financial records are kept for at least {{compliance.retentionYears}} years or longer if a funder requires.

### Internal Controls and Segregation of Duties

- No single person controls a financial transaction from start to finish. Where staffing allows, different people authorize, record, and reconcile each type of transaction.
- Bank accounts are reconciled monthly by someone who does not sign checks or make deposits, and the reconciliation is reviewed and signed by the {{roles.finance.title}} or {{roles.executive.title}}.
- Purchases above set limits require prior approval, and checks or electronic payments above $5,000 require two authorized approvals.
- Payroll changes are authorized by the {{roles.hr.title}} and reviewed before each payroll is processed.
- Access to the accounting and billing systems is limited by role and reviewed at least annually.
- Petty cash is kept locked, limited in amount, and reconciled monthly.

### Billing and Collections

1. Services are billed promptly, within payer timelines, based on completed documentation, as described in the Corporate Compliance policy.
2. Payments are posted and claims are reconciled to remittances. Denials are reviewed, corrected, and resubmitted or appealed, and denial trends are reported monthly.
3. Accounts receivable are aged and reviewed monthly. Balances owed by persons served are pursued respectfully, and payment plans or financial hardship adjustments are offered according to written criteria.
4. Write-offs require approval by the {{roles.finance.title}}, and larger write-offs require the {{roles.executive.title}}.

### Fee Schedules

{{agency.name}} maintains a written fee schedule for each service. Fees and any sliding-scale or financial assistance options are explained to persons served{{#if program.servesMinors}} or their parents or guardians{{/if}} before services begin, in writing, and the person's financial responsibility is documented. The fee schedule is reviewed and approved at least annually.

### Annual Review or Audit

At the end of each fiscal year, the financial statements are reviewed or audited by an independent certified public accountant. A full audit is obtained whenever required by law, by funders, or by contract, including a federal Single Audit when federal expenditures reach the required threshold. Results, including any management letter, are reviewed by {{#if agency.hasBoard}}the {{agency.governingBody}}{{else}}the {{roles.executive.title}} and ownership{{/if}}, and any findings are corrected with a written plan.

{{#if ops.fundraising}}
### Fundraising

{{agency.name}} conducts fundraising in an ethical and transparent way.

- Fundraising activities and goals are approved {{#if agency.hasBoard}}by the {{agency.governingBody}}{{else}}by the {{roles.executive.title}}{{/if}} as part of the budget.
- Donations are recorded and acknowledged in writing. Restricted gifts are tracked and used only for their stated purpose.
- Costs of fundraising are tracked and reported.
- Donor information is kept confidential, and donor lists are never sold or shared.
- Persons served are not solicited for donations, and information about persons served is not used in fundraising without written authorization.
{{#if agency.isNonprofit}}
- {{agency.name}} complies with state charitable solicitation registration and IRS requirements for tax-exempt organizations.
{{/if}}
{{/if}}

## Responsibilities

- {{roles.finance.title}}: prepares budgets and financial reports, maintains internal controls, and manages billing and collections.
- {{roles.executive.title}}: approves spending within the budget and oversees financial performance.
{{#if agency.hasBoard}}
- {{agency.governingBody}}: approves the budget and oversees the audit or review.
{{/if}}

## Related Documents

- Fiscal procedures manual
- Annual budget and monthly financial statements
- Fee schedule
- Independent audit or review report
`,
};
