export default {
  id: 'code-of-ethics',
  number: '1.02',
  section: 'ASPIRE',
  standard: '1.A',
  topic: 'Leadership',
  title: 'Code of Ethics and Conduct',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.A', topic: 'Ethical codes of conduct', heading: 'Code of Conduct' },
    { standard: '1.A', topic: 'Conflicts of interest', heading: 'Conflicts of Interest' },
    { standard: '1.A', topic: 'Gifts and gratuities', heading: 'Gifts' },
    { standard: '1.A', topic: 'Relationships with persons served', heading: 'Relationships with Persons Served' },
    { standard: '1.A', topic: 'Marketing and fundraising ethics', heading: 'Marketing and Fundraising' },
    { standard: '1.A', topic: 'Witnessing documents', heading: 'Witnessing Documents' },
    { standard: '1.A', topic: 'Reporting and investigating ethics violations', heading: 'Reporting and Investigating Violations' },
    { standard: '1.A', topic: 'Non-retaliation', heading: 'Non-Retaliation' },
  ],
  consultantNotes: 'Confirm the gift dollar threshold ($25 suggested) and whether the agency prefers a zero-gift rule. Confirm the waiting period for personal relationships with former persons served (two years suggested; some professional licensing boards set longer or permanent bans for clinicians, so check the applicable license rules). Confirm the investigation timeline (begin within 3 business days, conclude within 30 days). If the agency has a separate employee handbook, align disciplinary language. Verify any state requirement for professional-licensure board reporting.',
  body: `
## Purpose

This policy sets the ethical standards that guide the conduct of everyone who works for or represents {{agency.name}}, and describes how ethical concerns are raised, investigated, and resolved.

## Scope

This policy applies to leadership and all personnel (employees{{#if ops.volunteers}}, volunteers{{/if}}{{#if ops.students}}, students and interns{{/if}}{{#if ops.contractors}}, contractors{{/if}}){{#if agency.hasBoard}}, and to every member of the {{agency.governingBody}}{{/if}}.

## Policy

{{agency.name}} conducts all business and services with honesty, fairness, and respect for the dignity and rights of persons served. Every person covered by this policy receives the code of conduct at orientation{{#if agency.hasBoard}} or board onboarding{{/if}}, signs an acknowledgment, and reaffirms it {{admin.reviewFrequency}}. Professionals who hold a license or certification also follow the ethical code of their discipline. When the two differ, the stricter standard applies.

## Procedures

### Code of Conduct

Everyone covered by this policy is expected to:

- Treat persons served, families, coworkers, and the public with respect, courtesy, and cultural humility.
- Protect the privacy and confidentiality of persons served, following agency privacy policies and applicable law{{#if compliance.hipaa}}, including HIPAA{{#if compliance.part2}} and 42 CFR Part 2{{/if}}{{/if}}.
- Provide services only within the scope of their training, credentials, and job description.
- Keep accurate, timely, and truthful records, including service documentation, time records, and billing.
- Never abuse, neglect, exploit, or financially take advantage of a person served.
- Follow all laws, regulations, contracts, and agency policies.
- Use agency property, funds, and information only for agency business.
- Report suspected unethical, illegal, or unsafe conduct promptly.

### Conflicts of Interest

A conflict of interest exists when a personal, financial, or family interest could influence, or appear to influence, a person's judgment on behalf of the agency. Examples include a financial interest in a vendor, outside employment with a competing provider, or making hiring or purchasing decisions that involve a relative.

1. Personnel disclose actual or potential conflicts in writing to their supervisor and the {{roles.compliance.title}} as soon as they become aware of them.
2. Leadership team members{{#if agency.hasBoard}} and members of the {{agency.governingBody}}{{/if}} complete a conflict-of-interest disclosure statement at appointment and {{admin.reviewFrequency}} thereafter.
3. The {{roles.compliance.title}} reviews each disclosure and decides on a management plan, such as recusal from a decision, reassignment, or ending the conflicting activity.
4. A person with a conflict does not participate in the related decision.

### Gifts

Personnel do not solicit or accept cash, gift cards, loans, or gifts of more than nominal value (no more than $25) from persons served, families, vendors, or referral sources. Small items such as a card, a homemade treat, or a token of appreciation may be accepted and shared with the team. Personnel do not give personal gifts or money to persons served, and do not buy from or sell to persons served. Gifts offered by a vendor or referral source that exceed the limit are politely declined and reported to the {{roles.compliance.title}}.

### Relationships with Persons Served

Personnel maintain professional boundaries at all times. Personnel do not:

- Engage in any romantic or sexual relationship with a person served or a member of their family.
- Enter into a romantic or sexual relationship with a former person served for at least two years after services end, and never where the relationship would exploit the person.
- Enter into business, financial, or other dual relationships with persons served.
- Connect with persons served on personal social media accounts, or share personal contact information outside agency channels.
{{#if program.servesMinors}}
- Have unsupervised contact with a minor served outside of planned service activities.
{{/if}}

Personnel who had a prior relationship with a person seeking services disclose it to their supervisor so that services can be assigned appropriately.

### Marketing and Fundraising

All marketing, advertising, and public statements are accurate and do not overstate services, outcomes, or credentials. Photographs, stories, or testimonials from persons served are used only with written authorization{{#if program.servesMinors}} (from the parent or guardian for a minor){{/if}}, and persons served are never pressured to participate. Referral sources are never offered payment or anything of value in exchange for referrals.

{{#if ops.fundraising}}
Fundraising is conducted honestly. Donations are used for the purposes stated to donors, donors' privacy is respected, and persons served are never solicited for donations or required to take part in fundraising.
{{else}}
{{agency.name}} does not conduct charitable fundraising. If it begins to do so, this section will be expanded before any solicitation takes place.
{{/if}}

### Witnessing Documents

Personnel do not sign as a witness on wills, powers of attorney, financial documents, or other legal documents for persons served, and do not serve as a person's guardian, representative payee, or power of attorney. Personnel may witness agency documents, such as consent forms and service plans, that are part of their job duties. When a person served needs a legal document witnessed, personnel help the person find an independent witness or notary.

### Reporting and Investigating Violations

1. Any person may report a suspected ethics violation to a supervisor, any member of leadership, or the {{roles.compliance.title}}, in person, in writing, or anonymously through the compliance reporting line.
2. Suspected abuse, neglect, or exploitation of a person served is also reported immediately to {{compliance.abuseReportingAgency}} ({{compliance.abuseHotline}}) as required by law and agency incident policy.
3. The {{roles.compliance.title}} begins an investigation within 3 business days. Reports involving the {{roles.compliance.title}} go to the {{roles.executive.title}}{{#if agency.hasBoard}}, and reports involving the {{roles.executive.title}} go to the chair of the {{agency.governingBody}}{{/if}}.
4. The investigation is documented, kept confidential to the extent possible, and normally concluded within 30 days.
5. Substantiated violations result in corrective action up to and including termination of employment, contract, or appointment, and are reported to licensing boards or authorities when required.

### Non-Retaliation

{{agency.name}} does not tolerate retaliation against anyone who, in good faith, reports a concern, cooperates in an investigation, or refuses to take part in an action they believe is unethical or illegal. Retaliation is itself a violation of this policy and results in corrective action. Making a report that is knowingly false is also a violation.

## Responsibilities

- {{roles.compliance.title}}: maintains the code, reviews disclosures, and leads investigations.
- Supervisors: model ethical conduct, address concerns, and forward reports.
- All personnel: follow the code and report concerns.

## Related Documents

- Code of conduct acknowledgment form
- Conflict-of-interest disclosure statement
- Corporate Compliance policy
`,
};
