export default {
  id: 'stakeholder-input',
  number: '1.07',
  section: 'ASPIRE',
  standard: '1.D',
  topic: 'Input from Persons Served and Other Stakeholders',
  title: 'Input from Persons Served and Other Stakeholders',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.D', topic: 'Ongoing collection of input', heading: 'Collecting Input' },
    { standard: '1.D', topic: 'Analysis of input', heading: 'Analyzing Input' },
    { standard: '1.D', topic: 'Use of input in planning and performance improvement', heading: 'Using Input' },
    { standard: '1.D', topic: 'Communicating actions taken', heading: 'Communicating What Changed' },
  ],
  consultantNotes: 'CARF expects input to be gathered on an ongoing basis from persons served, personnel, and other stakeholders, and to see evidence it was used. Confirm which methods the agency actually uses; delete any that do not exist (for example an advisory council). Annual survey timing and the quarterly review cadence are suggested defaults. If persons served receive a stipend or gift card for advisory participation, confirm it is handled consistently with the gifts and compliance policies.',
  body: `
## Purpose

This policy describes how {{agency.name}} gathers, analyzes, and acts on input from persons served, personnel, and other stakeholders, and how it lets people know what changed as a result.

## Scope

This policy applies to all programs{{#if multipleLocations}} and locations{{/if}} of {{agency.name}}. Stakeholders include persons served{{#if program.servesMinors}}, parents and guardians{{/if}}, families and natural supports, personnel, referral sources, funders, payers, community partners, and the state licensing agency ({{compliance.licensingAgency}}).

## Policy

{{agency.name}} seeks input on an ongoing basis, through more than one method, and uses it to improve services, plan for the future, and make decisions. Input is welcomed in any language or format, and no one is penalized for offering a complaint or criticism.

## Procedures

### Collecting Input

{{agency.name}} uses the following methods, and the {{roles.quality.title}} coordinates them:

- **Satisfaction surveys** of persons served at least annually and at discharge, available in plain language, in the languages commonly spoken by persons served, and in accessible formats. Personnel help anyone who needs assistance without influencing their answers.
- **Personnel surveys** at least annually covering job satisfaction, workload, training, and suggestions.
- **Stakeholder surveys** of referral sources, funders, and community partners at least annually.
- **Advisory input** from persons served{{#if program.servesMinors}} and families{{/if}} through an advisory group or regular focus groups, held at least twice a year.
- **Suggestion boxes or forms** at each location and online, which may be used anonymously.
- **Meetings**, including house or community meetings{{#if program.residential}} at residential sites{{/if}}, team meetings, and service planning meetings.
- **Grievances, complaints, and compliments**, which are logged and reviewed as a source of input.
{{#if program.telehealth}}
- **Brief post-session feedback** for telehealth services.
{{/if}}

### Analyzing Input

The {{roles.quality.title}} compiles input at least quarterly. Analysis includes identifying themes and trends, comparing results with previous periods and targets, looking for differences between programs{{#if multipleLocations}}, locations,{{/if}} or demographic groups, and noting any urgent concern that requires immediate action. Survey response rates are tracked so leadership can judge how representative the results are.

### Using Input

1. The leadership team reviews the analysis at least quarterly and decides which issues to act on.
2. Actions are assigned to a responsible position with a target date and tracked in the performance improvement plan.
3. Input is considered in the strategic plan, the budget, the cultural competency and accessibility plans, and program design.
4. Urgent concerns about safety or rights are referred immediately to the {{roles.safety.title}} or {{roles.rights.title}}.
{{#if agency.hasBoard}}
5. A summary of input and resulting actions is reported to the {{agency.governingBody}} at least annually.
{{/if}}

### Communicating What Changed

{{agency.name}} closes the loop with those who gave input. At least annually, and when a significant change is made, the agency shares a plain-language "You said, we did" summary through postings at each location, newsletters, advisory group meetings, staff meetings, and the website. When input is not acted on, the summary explains why.

## Responsibilities

- {{roles.quality.title}}: coordinates collection and analysis of input and tracks actions.
- Leadership team: reviews input and decides on actions.
- Program supervisors: encourage participation and share results with their teams and persons served.

## Related Documents

- Satisfaction survey tools
- Performance improvement plan
- Grievance and complaint policy
`,
};
