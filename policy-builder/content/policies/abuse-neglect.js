export default {
  id: 'abuse-neglect',
  number: '1.21',
  section: 'ASPIRE',
  standard: '1.K',
  topic: 'Rights of Persons Served',
  title: 'Abuse, Neglect, and Exploitation',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.K', topic: 'Definitions and prohibition of abuse, neglect, and exploitation', heading: 'Definitions' },
    { standard: '1.K', topic: 'Mandatory reporting', heading: 'Mandatory Reporting' },
    { standard: '1.K', topic: 'Protection of persons served', heading: 'Immediate Protection' },
    { standard: '1.K', topic: 'Investigation', heading: 'Investigation' },
    { standard: '1.K', topic: 'Training', heading: 'Training' },
  ],
  consultantNotes: 'Section 1.K lettering may shift between manual years; verify the crosswalk. Replace the general definitions with the state statutory and regulatory definitions where the state requires (Ohio DODD MUI rule, OhioMHAS rules, Ohio Revised Code adult protective services and child abuse reporting statutes). Confirm the reporting timeframe (Ohio DODD requires immediate action and notice to the county board for MUIs). Confirm the correct child protective services agency (in Ohio, the county public children services agency, or the statewide 855-642-4453 line). Confirm whether the state abuser registry check applies and whether a substantiated finding triggers registry placement.',
  body: `
## Purpose

{{agency.name}} does not tolerate abuse, neglect, or exploitation of any person served. This policy defines these acts, requires immediate reporting, and describes how persons served are protected and allegations are investigated.

## Scope

This policy applies to all personnel and to every person served in every program and setting.

## Policy

Abuse, neglect, and exploitation of persons served are prohibited. All personnel are mandatory reporters under this policy, whether or not state law names their position, and must report any known or suspected abuse, neglect, or exploitation immediately. No personnel member may investigate a concern before reporting it, and no one may discourage or interfere with a report. Anyone who reports in good faith is protected from retaliation.

### Definitions

- **Abuse** means any act, or threat of an act, that causes or could cause physical, emotional, or psychological harm, including physical abuse, sexual abuse or any sexual contact between personnel and a person served, verbal abuse, intimidation, humiliation, and the use of restrictive interventions that are not authorized.
- **Neglect** means the failure to provide care, supervision, or services needed to protect the health, safety, or welfare of a person served, when the agency has a duty to provide them.
- **Exploitation** means the unlawful or improper use of a person served or their money, property, or benefits for another's advantage{{#if ops.clientFunds}}, including misuse of funds the agency manages on the person's behalf{{/if}}.

Where state law defines these terms more broadly, the state definitions apply.

## Procedures

### Mandatory Reporting

1. Any personnel member who witnesses, suspects, or is told of abuse, neglect, or exploitation first ensures the person is safe and calls 911 if there is immediate danger or a medical emergency.
2. The personnel member reports immediately to their supervisor and to the state abuse reporting agency{{#if compliance.abuseReportingAgency}} ({{compliance.abuseReportingAgency}}){{/if}} at {{compliance.abuseHotline || "the state abuse hotline"}}. If the supervisor is unavailable or involved, the personnel member reports directly to the external agency and to the {{roles.rights.title}}.
3. The supervisor notifies the {{roles.rights.title}}, the {{roles.clinical.title}}, and the {{roles.executive.title}} the same day.
4. The {{roles.compliance.title}} ensures all other required reports are made within required timeframes, including to the state licensing agency{{#if compliance.licensingAgency}} ({{compliance.licensingAgency}}){{/if}}, law enforcement when a crime may have occurred, and funders.
5. The personnel member completes a written incident report before the end of the shift. The incident is also handled under the Critical Incidents policy.

{{#if program.servesMinors}}### Minors

Suspected abuse or neglect of any child, whether a person served or a child of a person served, is reported immediately to the county children services or child protective services agency and to law enforcement as required by state law. Personnel do not contact the alleged perpetrator or notify a parent or guardian who may be involved before child protective services directs. Interviews of a child are left to child protective services and law enforcement.
{{/if}}
### Immediate Protection

The supervisor acts at once to protect the person served, including arranging medical care and emotional support, and ensuring the person is not left in contact with the alleged perpetrator. Any personnel member accused of abuse, neglect, or exploitation is immediately removed from contact with all persons served, placed on administrative leave or reassigned to duties without contact, pending the outcome of the investigation. If the alleged perpetrator is another person served or a visitor, the agency takes steps to separate them and protect everyone involved. Evidence is preserved.

### Investigation

The {{roles.rights.title}} or a trained investigator who is not involved in the incident conducts the agency's internal investigation, coordinated with and never interfering with external investigators. The agency cooperates fully with the state abuse reporting agency{{#if compliance.abuseReportingAgency}} ({{compliance.abuseReportingAgency}}){{/if}}, the state licensing agency{{#if compliance.licensingAgency}} ({{compliance.licensingAgency}}){{/if}}, law enforcement, and any other investigating authority, and provides records and access to personnel as permitted by law. The investigation is documented in writing with findings and actions taken. Substantiated allegations result in disciplinary action up to and including termination and reporting to any licensing board or registry as required. The person served{{#if program.servesMinors}}, or a minor's parent or guardian when appropriate,{{/if}} is informed of the outcome as permitted by law.

### Training

All personnel receive training on recognizing, preventing, and reporting abuse, neglect, and exploitation at orientation and at least annually. Training covers state definitions, reporting steps and contacts, the prohibition of retaliation, and warning signs particular to the populations served. Persons served are informed at intake, in accessible language, of their right to be free from abuse and how to report it.

## Responsibilities

- All personnel report immediately and protect persons served.
- The {{roles.rights.title}} oversees investigations and tracks outcomes.
- The {{roles.compliance.title}} ensures external reports are complete and timely.
- The {{roles.hr.title}} carries out administrative leave and disciplinary actions.

## Related Documents

- Rights of Persons Served
- Critical Incidents
- Grievances
`,
};
