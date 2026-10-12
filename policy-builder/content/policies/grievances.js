export default {
  id: 'grievances',
  number: '1.20',
  section: 'ASPIRE',
  standard: '1.K',
  topic: 'Rights of Persons Served',
  title: 'Complaints and Grievances',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.K', topic: 'Formal complaint procedure', heading: 'Filing a Grievance' },
    { standard: '1.K', topic: 'Levels of review and timelines', heading: 'Levels of Review' },
    { standard: '1.K', topic: 'External appeal options', heading: 'External Options' },
    { standard: '1.K', topic: 'Freedom from retaliation', heading: 'No Retaliation' },
    { standard: '1.K', topic: 'Annual analysis of formal complaints', heading: 'Documentation and Annual Analysis' },
  ],
  consultantNotes: 'Section 1.K lettering may shift between manual years; verify the crosswalk. CARF expects a written analysis of formal complaints at least annually. Many states set mandatory grievance timelines (for example, Ohio OhioMHAS client rights rules require acknowledgment and resolution within set business-day windows and that the rights officer assist the person); replace the defaults (3 business days to acknowledge, 14 calendar days to resolve at level one, 10 calendar days at level two) with state rules. Add the state protection and advocacy organization (Disability Rights Ohio in Ohio) and any Medicaid managed care plan or ombudsman contacts. Confirm whether personnel grievances should be in a separate HR policy.',
  body: `
## Purpose

{{agency.name}} gives persons served and other stakeholders a fair, accessible, and timely way to raise concerns and have them resolved, and uses what it learns to improve services.

## Scope

This policy applies to complaints and formal grievances from persons served, their families{{#if program.servesMinors}}, parents,{{/if}} and legal guardians, authorized representatives, and other stakeholders about any aspect of services or treatment by {{agency.name}}.

## Policy

Persons served are encouraged to bring concerns forward and may do so at any time, in any way. An informal complaint is a concern that can be resolved quickly by the personnel involved or their supervisor. A formal grievance is a concern the person wants addressed through this written procedure, or one that is not resolved informally. Any person may skip the informal step and file a formal grievance directly. Filing a grievance never affects a person's services.

## Procedures

### Filing a Grievance

1. A grievance may be filed by a person served, a parent or legal guardian, an authorized representative, or another person on the person's behalf with their consent.
2. A grievance may be made in writing, by phone, by email, in person, or using the agency grievance form, which is available at each location and from any personnel member. Grievances may be made in the person's preferred language or communication method.
3. Personnel help any person who needs assistance to file, and the person may have an advocate, family member, or other support person of their choice assist them at any stage.
4. Personnel who receive a grievance forward it to the {{roles.rights.title}} the same day.

### Levels of Review

**Level one.** The {{roles.rights.title}} acknowledges the grievance in writing within 3 business days, reviews the facts, talks with the person and others involved, and gives the person a written decision within 14 calendar days. The decision explains what was found, what will be done, and how to appeal.

**Level two.** If the person is not satisfied, they may appeal within 10 calendar days of the decision to the {{roles.executive.title}}, who reviews the grievance and gives a written final decision within 10 calendar days of the appeal. If the grievance concerns the {{roles.executive.title}}, the appeal is reviewed by {{#if agency.hasBoard}}the chair of the {{agency.governingBody}}{{else}}a reviewer outside the line of supervision designated by the agency's owner{{/if}}.

Timeframes may be extended once, by no more than 14 days, with written notice to the person explaining why. Grievances that allege abuse, neglect, exploitation, or an imminent risk to health or safety are acted on immediately and reported as required by the Abuse, Neglect, and Exploitation policy.

### External Options

At any time, whether or not they use this procedure, persons served may contact:

- The state licensing agency{{#if compliance.licensingAgency}} ({{compliance.licensingAgency}}){{/if}}
- The state abuse reporting agency{{#if compliance.abuseReportingAgency}} ({{compliance.abuseReportingAgency}}){{/if}}, at {{compliance.abuseHotline || "the state abuse hotline"}}, for concerns of abuse, neglect, or exploitation
- The state protection and advocacy organization and other advocacy services
- Their funding source, case manager, or health plan, where applicable
- CARF, regarding the agency's conformance to accreditation standards

Contact information for these organizations is included in the rights materials given at intake and is posted at each location.

### No Retaliation

No person who files a grievance or helps another person do so is subject to retaliation, barriers to services, or any change in services as a result. Any personnel member who retaliates is subject to discipline up to and including termination.

### Documentation and Annual Analysis

The {{roles.rights.title}} keeps a log of all formal grievances, including the date received, the nature of the grievance, actions taken, the resolution, and dates of each step. Grievance records are kept separately from the records of persons served.

At least annually, the {{roles.rights.title}} prepares a written analysis of all formal grievances that identifies trends, root causes, areas needing improvement, and actions taken or recommended. The analysis is reviewed by leadership, used in performance improvement planning, and {{#if agency.hasBoard}}summarized for the {{agency.governingBody}}{{else}}shared with personnel{{/if}}.

## Responsibilities

- The {{roles.rights.title}} manages the grievance process, log, and annual analysis.
- The {{roles.executive.title}} decides level two appeals and ensures improvements are made.
- All personnel help persons served raise concerns and forward grievances promptly.

## Related Documents

- Rights of Persons Served
- Grievance form and grievance log
`,
};
