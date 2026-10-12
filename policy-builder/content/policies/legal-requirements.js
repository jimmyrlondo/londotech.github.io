export default {
  id: 'legal-requirements',
  number: '1.08',
  section: 'ASPIRE',
  standard: '1.E',
  topic: 'Legal Requirements',
  title: 'Legal Requirements',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.E', topic: 'Compliance with legal and regulatory requirements', heading: 'Compliance with Laws, Regulations, and Contracts' },
    { standard: '1.E', topic: 'Monitoring changes in requirements', heading: 'Monitoring Changes' },
    { standard: '1.E', topic: 'Licenses and certifications', heading: 'Licenses and Certifications' },
    { standard: '1.E', topic: 'Contract review', heading: 'Contract Review' },
    { standard: '1.E', topic: 'Response to subpoenas', heading: 'Subpoenas and Court Orders' },
    { standard: '1.E', topic: 'Response to search warrants', heading: 'Search Warrants' },
    { standard: '1.E', topic: 'Response to investigations', heading: 'Government Investigations and Inquiries' },
    { standard: '1.E', topic: 'Access to legal counsel', heading: 'Legal Counsel' },
  ],
  consultantNotes: 'Confirm the agency has an identified attorney (retained or on call) and fill in contact details in the legal contact list. Part 2 records require a court order meeting 42 CFR Part 2 Subpart E; a subpoena alone is not sufficient, so make sure intake/front desk staff know this. Confirm state-specific rules on mental health record privilege. Confirm all licenses, certifications, and Medicaid provider agreements held by the agency and where each must be posted. Verify the current 1.E standard list for any item not addressed (for example, written procedures for legal actions involving persons served).',
  body: `
## Purpose

This policy describes how {{agency.name}} meets its legal, regulatory, and contractual obligations, and how personnel respond to legal requests such as subpoenas, search warrants, and investigations.

## Scope

This policy applies to all personnel, programs, and locations of {{agency.name}}.

## Policy

{{agency.name}} complies with all applicable federal, state, and local laws and regulations, licensing and certification requirements, and the terms of its contracts. Personnel do not respond to legal process on their own; legal requests are handled through the {{roles.compliance.title}} and, when needed, legal counsel, so that the rights of persons served and of the agency are protected.

## Procedures

### Compliance with Laws, Regulations, and Contracts

The {{roles.compliance.title}} maintains a list of the legal and regulatory requirements that apply to {{agency.name}}, including licensing rules of {{compliance.licensingAgency}}, Medicaid and other payer rules, employment law, health and safety codes, accessibility law{{#if compliance.hipaa}}, HIPAA privacy and security rules{{/if}}{{#if compliance.part2}}, 42 CFR Part 2{{/if}}, and the terms of each funding contract. Each requirement is assigned to a responsible position.

### Monitoring Changes

The {{roles.compliance.title}} monitors changes in laws, regulations, and payer requirements through regulator notices, trade and provider associations, payer bulletins, and legal counsel. When a change affects the agency, the {{roles.compliance.title}} notifies the leadership team, and the responsible position updates policies, forms, and training within the effective date of the change. Changes are reviewed at leadership meetings at least quarterly.

### Licenses and Certifications

- The {{roles.compliance.title}} keeps a register of every license, certification, accreditation, and provider agreement held by the agency, with renewal dates.
- Renewals are started at least 90 days before expiration.
- Current licenses and certificates are posted in a public area at each location as required.
- The {{roles.hr.title}} verifies and tracks the professional licenses and certifications of personnel, and no one practices with an expired credential.
- Survey or inspection reports from {{compliance.licensingAgency}} and other regulators are reviewed by leadership, and plans of correction are submitted and completed on time.

### Contract Review

Before signing, every contract, lease, grant, or agreement is reviewed by the {{roles.executive.title}} or designee for scope, payment terms, insurance and indemnification, confidentiality and data protection{{#if compliance.hipaa}} (including a business associate agreement when protected health information is shared{{#if compliance.part2}}, and a qualified service organization agreement when Part 2 information is shared{{/if}}){{/if}}, termination, and compliance obligations. Contracts with significant risk or unusual terms are reviewed by legal counsel. Only positions with written signing authority may sign. Signed contracts are kept in a central file, and key obligations and renewal dates are tracked.

### Subpoenas and Court Orders

1. Any personnel member who receives a subpoena, court order, or other legal document accepts it politely, does not release any records or make any statement, and immediately delivers it to the {{roles.compliance.title}}.
2. The {{roles.compliance.title}} logs the document, verifies its validity, and consults legal counsel as needed.
3. Records of persons served are released only as permitted by law: with a valid authorization from the person{{#if program.servesMinors}} or the parent or guardian of a minor{{/if}}, {{#unless compliance.hipaa}}or {{/unless}}in response to a valid court order{{#if compliance.hipaa}}, or as otherwise permitted by HIPAA{{/if}}.
{{#if compliance.part2}}
4. Records protected by 42 CFR Part 2 are not released in response to a subpoena alone. A court order that meets Part 2 requirements, or the patient's written consent, is required.
{{/if}}
5. Personnel who are subpoenaed to testify notify the {{roles.compliance.title}} and receive guidance before appearing.

### Search Warrants

When law enforcement presents a search warrant, personnel do not obstruct or resist. The most senior person on site asks to see the warrant and the officer's identification, keeps a copy, immediately contacts the {{roles.executive.title}} and the {{roles.compliance.title}}, and asks the officers to wait a reasonable time for counsel to arrive (officers are not required to wait). Personnel observe the search, keep a list of what is taken, and do not volunteer information beyond what the warrant requires. The safety and privacy of persons served present are protected throughout.

### Government Investigations and Inquiries

Requests for information from government agencies, auditors, or investigators, including {{compliance.licensingAgency}}, payers, and law enforcement, are referred to the {{roles.compliance.title}}. The agency cooperates fully and truthfully. No record is altered, destroyed, or withheld after the agency learns of an investigation, and any routine record destruction affecting relevant records is suspended (a legal hold).

### Legal Counsel

{{agency.name}} maintains access to qualified legal counsel. The {{roles.executive.title}} and {{roles.compliance.title}} may contact counsel at any time. Counsel is consulted on litigation, subpoenas and warrants, significant contracts, employment actions with legal risk, potential overpayments or self-disclosures, and changes in law with major effect. Communications with counsel are kept confidential.

## Responsibilities

- {{roles.compliance.title}}: monitors legal requirements, maintains the license register, and coordinates responses to legal process.
- {{roles.executive.title}}: approves contracts and engages legal counsel.
- {{roles.hr.title}}: tracks personnel credentials.
- All personnel: forward any legal document or inquiry immediately.

## Related Documents

- Legal and regulatory requirements register
- License and certification register
- Release of Information policy
`,
};
