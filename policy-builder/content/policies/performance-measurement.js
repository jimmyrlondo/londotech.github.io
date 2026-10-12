export default {
  id: 'performance-measurement',
  number: '1.23',
  section: 'ASPIRE',
  standard: '1.M',
  topic: 'Performance Measurement and Management',
  title: 'Performance Measurement and Management',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.M', topic: 'Data collection for business functions and service delivery', heading: 'Data Collection' },
    { standard: '1.M', topic: 'Performance indicators and targets', heading: 'Performance Indicators and Targets' },
    { standard: '1.M', topic: 'Data reliability, validity, completeness, and accuracy', heading: 'Data Quality' },
    { standard: '1.M', topic: 'Analysis of performance', heading: 'Analysis' },
  ],
  consultantNotes: 'Section 1.M lettering may shift between manual years; verify the crosswalk. CARF expects service delivery measures in four domains (effectiveness, efficiency, service access, and experience of services received and other feedback), each with an indicator, the persons served to whom it applies, who collects the data, the data source, and a performance target. Confirm the agency has a written measurement plan document with these elements; the policy alone is not enough. Some program sections (for example Employment Services) have their own required measures; coordinate with program-specific policies. The quarterly reporting cadence and 10% record audit sample are recommended defaults.',
  body: `
## Purpose

{{agency.name}} collects and uses information about its business functions and service delivery to understand how well it is serving persons served and to manage toward better results.

## Scope

This policy applies to all programs and business functions of {{agency.name}}, including {{list program.serviceList}}.

## Policy

{{agency.name}} maintains a written performance measurement plan that defines what is measured, how, by whom, and against what targets. Measurement is focused on results that matter to persons served and is used to make decisions, not only to report. The {{roles.quality.title}} coordinates performance measurement under the direction of the {{roles.executive.title}}.

## Procedures

### Data Collection

The agency collects data on business functions, such as financial performance, human resources and turnover, health and safety, risk management, technology, and accessibility, and on service delivery in each of the following areas:

- **Effectiveness:** the results achieved by persons served, such as goal attainment, {{#if program.ECS}}employment outcomes, {{/if}}{{#if program.BH}}symptom reduction or functional improvement, {{/if}}and community participation
- **Efficiency:** the relationship between resources used and results achieved, such as cost per outcome or length of service
- **Service access:** the agency's capacity to provide services to those who request them, such as time from referral to first service and no-show rates
- **Experience of services received and other feedback:** the experience of persons served{{#if program.servesMinors}}, parents, and guardians{{/if}} and of other stakeholders such as referral sources, funders, and employers, gathered through surveys and other methods at least annually and at discharge where practical

Data sources include {{ops.ehrSystem || "the electronic health record"}}, surveys, financial and personnel systems, incident and grievance logs, and follow-up contacts with persons served after discharge.

### Performance Indicators and Targets

For each measure, the performance measurement plan states:

1. The objective and the performance indicator
2. The persons served to whom the indicator applies
3. The position responsible for collecting the data
4. The data source and the time of measurement
5. The performance target, based on the agency's past results, funder or industry benchmarks, or the agency's goals

Indicators and targets are reviewed at least annually and revised as programs, persons served, or strategic priorities change.

### Data Quality

The agency takes steps to ensure that data are reliable, valid, complete, and accurate:

- Indicators are defined in writing so they are measured the same way each time.
- Personnel who collect data are trained on definitions and procedures.
- Data are collected using standard forms or system fields wherever possible, and required fields are enforced in {{ops.ehrSystem || "the electronic health record"}}.
- The {{roles.quality.title}} audits a sample of records, at least 10 percent per program each quarter, to confirm completeness and accuracy, and corrects errors found.
- Response rates for surveys are tracked, and results are interpreted with their limitations in mind.

### Analysis

The {{roles.quality.title}} compiles performance data at least quarterly for leadership review and completes a full analysis at least annually. The analysis compares results with targets and prior periods, examines differences across programs{{#if multipleLocations}}, locations,{{/if}} and groups of persons served, and identifies trends and areas needing improvement. The annual analysis is the basis for the Performance Improvement policy.

## Responsibilities

- The {{roles.quality.title}} maintains the measurement plan, data quality reviews, and reports.
- Program leaders and the {{roles.clinical.title}} ensure accurate data collection in their programs.
- The {{roles.finance.title}} and {{roles.hr.title}} provide business function data.
- The {{roles.executive.title}} reviews results and sets priorities.

## Related Documents

- Performance measurement plan
- Performance Improvement
- Satisfaction and experience surveys
`,
};
