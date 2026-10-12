export default {
  id: 'rights-of-persons-served',
  number: '1.19',
  section: 'ASPIRE',
  standard: '1.K',
  topic: 'Rights of Persons Served',
  title: 'Rights of Persons Served',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.K', topic: 'Rights of persons served', heading: 'Rights' },
    { standard: '1.K', topic: 'Communication of rights', heading: 'Communicating Rights' },
    { standard: '1.K', topic: 'Investigation and resolution of alleged rights infringement', heading: 'Alleged Rights Violations' },
    { standard: '1.K', topic: 'Research guidelines', heading: 'Research', showIf: 'ops.research' },
  ],
  consultantNotes: 'Section 1.K lettering may shift between manual years; verify the crosswalk and the current list of rights CARF expects the policy to address. States often have their own statutory rights lists that must be posted verbatim (for example, Ohio client rights rules for OhioMHAS-certified providers and DODD rights under ORC 5123.62); attach the state list as an addendum. Confirm whether the state requires a designated client rights officer and specific posting requirements. Confirm language access obligations (Title VI, Section 1557). If the agency participates in research, confirm IRB arrangements.',
  body: `
## Purpose

{{agency.name}} protects and promotes the rights of every person served. This policy states those rights, how they are communicated, and how alleged violations are addressed.

## Scope

This policy applies to all personnel and all persons served in every program and setting{{#if program.servesMinors}}, and to parents and legal guardians who exercise rights on behalf of persons served{{/if}}.

## Policy

Every person served is treated with dignity and respect. {{agency.name}} does not restrict a right of a person served except as permitted by law and as documented in the person's plan with the person's participation, and any restriction is reviewed regularly so it is lifted as soon as possible. The {{roles.rights.title}} oversees rights protection and is available to persons served, families, and personnel.

### Rights

Each person served has the right to:

- Confidentiality of information, and to have their information released only as permitted by law or with their written authorization
- Privacy
- Freedom from abuse, financial or other exploitation, retaliation, humiliation, and neglect
- Access to their own information, including their record, in a reasonable time, consistent with law
- Informed consent or refusal, or expression of choice, regarding service delivery, release of information, concurrent services, the composition of the service delivery team, and participation in research or promotional activities
- Access to self-help and advocacy support services, and to be informed of how to contact them
- Adherence to research guidelines and ethics when persons served are involved in research
- Investigation and resolution of alleged infringement of their rights, through the grievance process, without retaliation
- Be treated without discrimination on any basis protected by law
- Participate in planning their services and to receive services in the most integrated setting appropriate to their needs
{{#if ops.usesRestraint}}- Be free from restraint except as an emergency safety intervention when there is imminent risk of serious harm, and never as punishment, for convenience, or as a substitute for services
{{else}}- Be free from restraint and seclusion
{{/if}}{{#if ops.clientFunds}}- Manage their own money to the fullest extent possible and to receive an accounting of any funds the agency holds for them
{{/if}}- Exercise all other legal rights, including civil, religious, and voting rights

## Procedures

### Communicating Rights

1. At intake, before or at the start of services, personnel explain these rights and the grievance procedure in a way the person understands and give the person a written copy. The person{{#if program.servesMinors}} or, for a minor, the parent or legal guardian{{/if}} signs an acknowledgment, which is kept in {{ops.ehrSystem || "the record"}}.
2. Rights are reviewed with each person served at least annually and whenever the person asks.
3. Rights information is provided in accessible formats, such as plain language, large print, audio, or with visual supports, and in the person's preferred language through qualified interpreters or translated materials at no cost to the person.
4. A summary of rights, the grievance procedure, and contact information for the {{roles.rights.title}}, the state licensing agency{{#if compliance.licensingAgency}} ({{compliance.licensingAgency}}){{/if}}, the state abuse reporting agency{{#if compliance.abuseReportingAgency}} ({{compliance.abuseReportingAgency}}){{/if}}, and advocacy organizations is posted at each location.

{{#if program.servesMinors}}### Minors and Guardians

For persons served who are minors, parents or legal guardians receive the rights information and exercise consent on the minor's behalf, except where state law allows a minor to consent to their own services. Minors are informed of their rights in age-appropriate language and are involved in decisions to the fullest extent appropriate. Where a minor has consented to their own services under state law, their information is protected accordingly, including from parents when the law requires.
{{/if}}
### Adults with Guardians

When an adult person served has a court-appointed guardian, personnel work with the guardian within the scope of the guardianship order, keep a copy of the order in the record, and continue to involve the person in decisions and respect their preferences.

### Alleged Rights Violations

Any personnel member who observes or learns of a possible rights violation reports it to their supervisor and the {{roles.rights.title}} the same day. The {{roles.rights.title}} reviews or investigates the allegation, takes steps to protect the person, and informs the person of the outcome. Allegations involving abuse, neglect, or exploitation are handled under that policy and reported externally. Persons served may also use the Grievances policy.

{{#if ops.research}}### Research

{{agency.name}} participates in research involving persons served only when the research has been approved by an institutional review board and by the {{roles.executive.title}}. Participation is voluntary, requires written informed consent{{#if program.servesMinors}} (and, for minors, parental permission and the minor's assent){{/if}}, and may be withdrawn at any time without any effect on services. Information is protected as required by law and the approved protocol.
{{/if}}
## Responsibilities

- The {{roles.rights.title}} oversees rights protection, training, and review of alleged violations.
- All personnel respect and protect the rights of persons served and report concerns.
- The {{roles.clinical.title}} ensures any rights restriction is justified, documented, and reviewed.

## Related Documents

- Grievances
- Abuse, Neglect, and Exploitation
- Rights statement and acknowledgment form
`,
};
