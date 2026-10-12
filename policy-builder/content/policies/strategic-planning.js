export default {
  id: 'strategic-planning',
  number: '1.06',
  section: 'ASPIRE',
  standard: '1.C',
  topic: 'Strategic Planning',
  title: 'Strategic Planning',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.C', topic: 'Information considered in strategic planning', heading: 'Information Considered' },
    { standard: '1.C', topic: 'Development of the strategic plan', heading: 'Developing the Plan' },
    { standard: '1.C', topic: 'Contents of the strategic plan', heading: 'Contents of the Plan' },
    { standard: '1.C', topic: 'Communication of the strategic plan', heading: 'Sharing the Plan' },
    { standard: '1.C', topic: 'Review and update of the strategic plan', heading: 'Review and Update' },
  ],
  consultantNotes: 'Verify the list of planning considerations against the current 1.C standard (the list changes between manual years). CARF surveyors expect to see a written plan with goals and priorities, evidence it was shared, and evidence of at least annual review and update; keep the progress reports. A three-year horizon is suggested, not required. Confirm who formally approves the plan.',
  body: `
## Purpose

This policy describes how {{agency.name}} develops, shares, and updates a strategic plan that sets its direction and priorities.

## Scope

This policy applies to leadership{{#if agency.hasBoard}}, the {{agency.governingBody}},{{/if}} and all programs and locations of {{agency.name}}.

## Policy

{{agency.name}} maintains a written strategic plan, normally covering three years, that sets goals and priorities in support of the mission. The plan is based on information about the agency and its environment, and is reviewed and updated at least annually.

## Procedures

### Information Considered

When developing or updating the plan, leadership gathers and considers:

- The expectations and input of persons served{{#if program.servesMinors}}, families, and guardians{{/if}}.
- The expectations of personnel, funders, referral sources, regulators, and other stakeholders.
- The environment in which the agency operates, including community needs, demographics, workforce conditions, and changes in law, regulation, and funding.
- Competition and collaboration, including other providers of similar services and potential partners.
- The financial position of the agency, including revenue trends, reimbursement rates, reserves, and the results of the most recent budget and audit.
- Technology needs and opportunities, including the technology and accessibility plan and {{ops.ehrSystem || "the electronic health record"}}.
- Results of performance measurement, outcomes, satisfaction surveys, and the risk management plan.
- Accessibility, cultural competency, and health and safety needs.

### Developing the Plan

1. The {{roles.executive.title}} leads the planning process with the leadership team{{#if agency.hasBoard}} and members of the {{agency.governingBody}}{{/if}}.
2. Leadership reviews the information above and identifies strengths, weaknesses, opportunities, and threats.
3. Personnel, persons served, and stakeholders are invited to comment on draft priorities through surveys, meetings, or advisory groups.
4. Leadership sets a small number of strategic goals and, for each goal, measurable objectives, a responsible position, timelines, and needed resources.
5. The plan is approved by {{#if agency.hasBoard}}the {{agency.governingBody}}{{else}}the {{roles.executive.title}}{{/if}}.

### Contents of the Plan

The written plan includes the mission{{#if agency.vision}}, vision,{{/if}} and values; a summary of the information considered; strategic goals and objectives; the person responsible for each objective; target dates; and how progress will be measured. The annual budget and the plans for technology, workforce, and accessibility are aligned with the strategic goals.

### Sharing the Plan

The plan, or a summary of it, is shared with personnel at a staff meeting and through internal communication, with persons served and stakeholders through newsletters, advisory groups, postings, or the website, and with new personnel during orientation. The summary is written in plain language.

### Review and Update

- Leadership reviews progress on each objective at least quarterly and records the status.
- At least annually, the {{roles.executive.title}} leads a formal review of the plan, updates the information considered, and revises goals and objectives as needed.
- The updated plan is approved and shared in the same way as the original.
- A full new plan is developed at the end of the plan period or sooner if the agency's circumstances change significantly.

## Responsibilities

- {{roles.executive.title}}: leads planning, monitors progress, and reports results.
- Leadership team: carries out assigned objectives and reports status.
- {{roles.quality.title}}: supplies performance and outcome data for planning.
{{#if agency.hasBoard}}
- {{agency.governingBody}}: approves the plan and monitors progress.
{{/if}}

## Related Documents

- Strategic plan and quarterly progress reports
- Stakeholder Input policy
- Financial Management policy
- Risk Management policy
`,
};
