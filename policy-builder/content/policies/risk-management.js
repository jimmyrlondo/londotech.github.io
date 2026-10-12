export default {
  id: 'risk-management',
  number: '1.11',
  section: 'ASPIRE',
  standard: '1.G',
  topic: 'Risk Management',
  title: 'Risk Management',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.G', topic: 'Risk management plan', heading: 'Risk Management Plan' },
    { standard: '1.G', topic: 'Identification of loss exposures', heading: 'Identifying Loss Exposures' },
    { standard: '1.G', topic: 'Evaluation and actions to reduce risk', heading: 'Evaluating and Reducing Risk' },
    { standard: '1.G', topic: 'Monitoring and reporting results', heading: 'Monitoring and Reporting' },
    { standard: '1.G', topic: 'Annual review of the plan', heading: 'Annual Update' },
    { standard: '1.G', topic: 'Insurance coverage review', heading: 'Insurance Coverage' },
    { standard: '1.G', topic: 'Review of contracts for risk', heading: 'Contract Review for Risk' },
    { standard: '1.G', topic: 'Media relations and social media', heading: 'Media Relations and Social Media' },
    { standard: '1.G', topic: 'Contracted services', heading: 'Contracted Services', showIf: 'ops.contractors' },
  ],
  consultantNotes: 'Surveyors expect a written risk management plan document separate from this policy, with evidence of the annual update. Confirm insurance types and limits with the broker (cyber liability, abuse and molestation, professional, D&O, auto, workers compensation). Confirm the media spokesperson. The contracted services subsection prints only when the profile says the agency uses contractors; CARF 1.G includes items about annual review of contracted services that provide direct services or administrative functions, so verify the exact scope against the current manual year.',
  body: `
## Purpose

This policy describes how {{agency.name}} identifies, evaluates, and reduces risks that could harm persons served, personnel, the agency's finances, or its reputation.

## Scope

This policy applies to all programs, locations, and operations of {{agency.name}}.

## Policy

{{agency.name}} maintains a written risk management plan that is carried out throughout the year and updated at least annually. Risk management is coordinated with corporate compliance, health and safety, quality improvement, and financial management.

## Procedures

### Risk Management Plan

The {{roles.quality.title}} coordinates the plan with input from the leadership team, and the {{roles.executive.title}} approves it{{#if agency.hasBoard}} and reports it to the {{agency.governingBody}}{{/if}}. The plan follows these steps.

### Identifying Loss Exposures

At least annually, leadership identifies the agency's exposures to loss in areas such as:

- Safety of persons served, including incidents, injuries, abuse or neglect{{#if ops.administersMeds}}, medication errors{{/if}}{{#if ops.usesRestraint}}, use of restraint{{/if}}, and suicide or overdose risk.
- Safety of personnel, including workplace violence, injuries, and home and community visits.
- Clinical and professional liability, including documentation, supervision, and scope of practice.
- Financial risks, including reimbursement changes, billing errors, fraud, and dependence on a few funding sources.
- Privacy and information security, including data breaches, ransomware, and loss of access to {{ops.ehrSystem || "the electronic health record"}}.
- Workforce risks, including turnover, vacancies, and loss of key personnel.
- Facilities and property{{#if program.residential}}, including residential sites{{/if}}.
{{#if ops.transportation}}
- Vehicles and the transportation of persons served.
{{/if}}
- Legal and regulatory compliance, contracts, and reputation.

Sources include incident and grievance reports, insurance claims, audits, inspections, satisfaction surveys, and the compliance risk assessment.

### Evaluating and Reducing Risk

1. Each identified exposure is rated for likelihood and severity.
2. For the highest priority risks, leadership chooses a response: avoid, reduce, transfer (such as through insurance or contracts), or accept.
3. Each action is written into the plan with a responsible position, a target date, and how success will be measured.

### Monitoring and Reporting

The {{roles.quality.title}} tracks progress on each action and reviews incident and claims data at least quarterly. Results are reported to the leadership team quarterly{{#if agency.hasBoard}} and to the {{agency.governingBody}} at least annually{{/if}}, and actions are adjusted when results show they are not working.

### Annual Update

At least annually, leadership reviews the plan's results, re-identifies loss exposures, and updates the plan. The updated plan is approved by the {{roles.executive.title}}{{#if agency.hasBoard}}, reported to the {{agency.governingBody}},{{/if}} and shared with personnel who have assigned actions.

### Insurance Coverage

The {{roles.finance.title}} works with the agency's insurance broker at least annually to review coverage and limits against the agency's risks. Coverage includes, at a minimum, general liability, professional liability, property, workers' compensation{{#if agency.hasBoard}}, directors and officers liability{{/if}}{{#if ops.transportation}}, vehicle liability (including coverage for personnel who drive their own vehicles){{/if}}, and cyber liability. Certificates of insurance are obtained from landlords, vendors, and contractors where required.

### Contract Review for Risk

Before signing, contracts, leases, and agreements are reviewed for risk, including indemnification and hold-harmless terms, insurance requirements, data protection, and termination rights, as described in the Legal Requirements policy. Contracts that shift significant liability to {{agency.name}} are referred to legal counsel and the insurance broker.

### Media Relations and Social Media

- Only the {{roles.executive.title}} or a designee speaks to the media on behalf of {{agency.name}}. Personnel refer all media inquiries to the {{roles.executive.title}}.
- No information about a person served, including whether a person receives services, is shared with the media without written authorization{{#if compliance.part2}}, and information protected by 42 CFR Part 2 is never confirmed or disclosed{{/if}}.
- In a crisis or critical incident, the {{roles.executive.title}} prepares any public statement, with advice from legal counsel as needed.
- Official agency social media accounts are managed by designated personnel. Personnel do not post information, photos, or comments about persons served on any social media, and do not represent personal views as those of the agency.
- Negative online reviews or comments are not answered in a way that confirms someone is a person served.

{{#if ops.contractors}}
### Contracted Services

When {{agency.name}} contracts with another organization or individual to provide direct services to persons served or important administrative functions on its behalf:

1. The contract states the services to be provided, the required credentials and insurance, the duty to follow applicable agency policies and CARF standards, confidentiality{{#if compliance.hipaa}} and business associate{{/if}} obligations, and how performance will be measured.
2. Contractors are screened against exclusion lists before the contract begins and monthly thereafter.
3. The responsible leader reviews each contractor's performance at least annually, and documents the review, before the contract is renewed.
4. Problems with quality, safety, or compliance are addressed promptly and may result in a corrective plan or ending the contract.
{{/if}}

## Responsibilities

- {{roles.quality.title}}: coordinates the risk management plan and reports results.
- {{roles.finance.title}}: manages insurance coverage.
- {{roles.executive.title}}: approves the plan and serves as media spokesperson.
- Leadership team: carries out assigned risk-reduction actions.

## Related Documents

- Risk management plan
- Certificates of insurance
- Incident reporting policy
- Legal Requirements policy
`,
};
