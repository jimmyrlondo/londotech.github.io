export default {
  id: 'performance-improvement',
  number: '1.24',
  section: 'ASPIRE',
  standard: '1.N',
  topic: 'Performance Improvement',
  title: 'Performance Improvement',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.N', topic: 'Annual written analysis of performance', heading: 'Annual Performance Analysis' },
    { standard: '1.N', topic: 'Identification of areas needing improvement and action plans', heading: 'Improvement Action Plans' },
    { standard: '1.N', topic: 'Use of results in planning and decision making', heading: 'Use in Planning and Decision Making' },
    { standard: '1.N', topic: 'Communication of performance information', heading: 'Communicating Performance Information' },
  ],
  consultantNotes: 'Section 1.N lettering may shift between manual years; verify the crosswalk. CARF expects a written annual analysis of performance and that performance information is shared with persons served, personnel, and other stakeholders in a format tailored to each audience; surveyors often ask to see the actual communications (posted summaries, newsletters, staff meeting minutes). Confirm the timing of the annual report against the agency fiscal year and board calendar. Confirm whether funders require separate quality improvement plans.',
  body: `
## Purpose

{{agency.name}} uses the results of performance measurement to improve services and operations, and shares performance information openly with the people it serves and works with.

## Scope

This policy applies to all programs and business functions of {{agency.name}}.

## Policy

Performance improvement is ongoing and involves leadership, personnel, and persons served. At least annually, the agency prepares a written analysis of its performance, decides where to improve, acts on those decisions, and checks whether the actions worked. The {{roles.quality.title}} coordinates performance improvement and reports to the {{roles.executive.title}}.

## Procedures

### Annual Performance Analysis

Within 90 days after the close of each fiscal year{{#if agency.fiscalYearStart}} (which begins {{agency.fiscalYearStart}}){{/if}}, the {{roles.quality.title}} prepares a written performance analysis that:

- Compares service delivery results for effectiveness, efficiency, service access, and experience of services received with the targets set in the performance measurement plan
- Reviews business function results, including financial, workforce, health and safety, risk, technology, and accessibility results
- Incorporates the annual analyses of critical incidents, formal grievances, and accessibility
- Identifies trends and differences across programs{{#if multipleLocations}}, locations,{{/if}} and groups of persons served
- Notes where targets were met, where they were not, and possible reasons

### Improvement Action Plans

Leadership reviews the analysis and identifies areas needing improvement, giving priority to issues that affect the health, safety, rights, or outcomes of persons served. For each priority, the responsible leader prepares an action plan stating the goal, the actions to be taken, the responsible position, the timeline, and how success will be measured. Personnel and persons served are invited to help design improvements that affect them. The {{roles.quality.title}} tracks action plans and reports progress to leadership at least quarterly, and plans that are not achieving results are revised.

### Use in Planning and Decision Making

Performance results are used to inform the strategic plan, the annual budget, the technology plan, the accessibility plan, workforce planning and training, and program design. Leadership documents how performance information was considered when making significant decisions, such as in meeting minutes or planning documents.{{#if agency.hasBoard}} The {{agency.governingBody}} reviews the annual performance analysis and the status of improvement plans at least annually.{{/if}}

### Communicating Performance Information

{{agency.name}} shares performance information at least annually with:

- **Persons served**{{#if program.servesMinors}}, **parents, and guardians**{{/if}}, through a plain-language summary posted at each location and offered in accessible formats and the languages of persons served
- **Personnel**, through staff meetings, internal communications, and program-level reports
- **Other stakeholders**, such as funders, referral sources, and community partners, through annual reports or summaries tailored to their interests

Information shared with each audience is accurate, understandable, and protects the confidentiality of persons served.

## Responsibilities

- The {{roles.quality.title}} prepares the annual analysis, tracks action plans, and coordinates communication of results.
- Leaders carry out improvement plans in their areas.
- The {{roles.executive.title}} ensures results are used in planning and decisions.

## Related Documents

- Performance Measurement and Management
- Annual performance analysis and improvement action plans
`,
};
