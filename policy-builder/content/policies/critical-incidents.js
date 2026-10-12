export default {
  id: 'critical-incidents',
  number: '1.14',
  section: 'ASPIRE',
  standard: '1.H',
  topic: 'Health and Safety',
  title: 'Critical Incidents',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.H', topic: 'Critical incident definitions', heading: 'Definition of Critical Incidents' },
    { standard: '1.H', topic: 'Internal and external reporting', heading: 'Reporting' },
    { standard: '1.H', topic: 'Investigation and root cause analysis', heading: 'Investigation and Review' },
    { standard: '1.H', topic: 'Debriefing', heading: 'Debriefing' },
    { standard: '1.H', topic: 'Annual written analysis of critical incidents', heading: 'Annual Analysis' },
  ],
  consultantNotes: 'Section 1.H lettering may shift between manual years; verify the crosswalk and the current list of incident types CARF requires the policy to address (the list here tracks recent manuals). State reporting timeframes vary widely; in Ohio, for example, DODD Major Unusual Incidents and OhioMHAS incident reporting each have their own definitions, categories, and deadlines (often immediate phone/verbal notice plus a written report within 24 hours or by the next business day). Replace the 24-hour defaults with the exact state rule and add any state incident category names. Confirm whether the funder or managed care organization also requires incident reports. The 30-day investigation target is a recommended default.',
  body: `
## Purpose

{{agency.name}} identifies, reports, investigates, and learns from critical incidents so that persons served and personnel are protected and similar incidents are prevented.

## Scope

This policy applies to all personnel and to every incident that occurs at an agency location, during services in any setting, or during agency-sponsored activities{{#if ops.transportation}} and transportation{{/if}}.

## Policy

All personnel report critical incidents immediately to their supervisor and complete a written incident report before the end of their shift. {{agency.name}} reports incidents to external authorities as required by law, regulation, and funding agreements, and uses incident data to improve safety. No one is disciplined or retaliated against for reporting an incident in good faith.

### Definition of Critical Incidents

A critical incident is an occurrence that results in, or had significant potential to result in, harm to a person served, personnel member, or visitor, or that threatens the safety or rights of persons served. Critical incidents include:

- Medication errors{{#if ops.medsAny}}, including wrong person, drug, dose, route, or time, and omitted doses{{/if}}
{{#if ops.usesRestraint}}- Any use of restraint as an emergency safety intervention
{{/if}}- Incidents involving injury, whether to a person served, personnel member, or visitor
- Communicable disease and infection control incidents, including exposures
- Aggression or violence
- Use or unauthorized possession of weapons
- Wandering or elopement
- Vehicular accidents
- Biohazard accidents
- Unauthorized use or possession of legal or illegal substances
- Abuse, neglect, or exploitation
- Suicide or attempted suicide
- Sexual assault
- Other sentinel events, meaning unexpected occurrences involving death or serious physical or psychological injury, or the risk of it

{{#unless ops.usesRestraint}}{{agency.name}} does not use restraint or seclusion. Any use of physical restraint or seclusion, for any reason, is reported and investigated as a critical incident and a possible rights violation.{{/unless}}

## Procedures

### Immediate Response

Personnel first make the situation safe: provide first aid, call 911 when needed, separate persons at risk, and preserve any evidence. Allegations of abuse or neglect are also handled under the Abuse, Neglect, and Exploitation policy, including immediate protection of the person served.

### Reporting

1. The personnel member who discovers or witnesses the incident notifies the supervisor immediately and completes a written incident report before the end of the shift, describing facts only.
2. The supervisor notifies the {{roles.clinical.title}} and the {{roles.safety.title}} the same day, and immediately for any sentinel event.
3. The {{roles.clinical.title}} or designee notifies the person's guardian{{#if program.servesMinors}} or, for a minor, parent{{/if}} or emergency contact as appropriate and with the person's consent where required.
4. The {{roles.compliance.title}} or designee makes required external reports within the required timeframes, including to the state licensing agency{{#if compliance.licensingAgency}} ({{compliance.licensingAgency}}){{/if}}, and for abuse, neglect, or exploitation to the state abuse reporting agency{{#if compliance.abuseReportingAgency}} ({{compliance.abuseReportingAgency}}){{/if}} at {{compliance.abuseHotline || "the state abuse hotline"}}. Other reports are made to law enforcement, public health, funders, and insurers as required.
5. The {{roles.executive.title}} is notified of every sentinel event within 24 hours{{#if agency.hasBoard}}, and the {{agency.governingBody}} is informed of sentinel events at its next meeting or sooner when warranted{{/if}}.

### Investigation and Review

The {{roles.safety.title}} or an assigned reviewer who was not involved in the incident reviews every critical incident, gathers statements and records, and determines contributing factors and needed follow-up. Investigations are completed within 30 days unless an external investigation requires otherwise.

For sentinel events, the {{roles.quality.title}} leads a root cause analysis that looks beyond individual error to systems, training, staffing, environment, and policy factors, and produces a written action plan with responsible positions and due dates.

### Debriefing

After any serious incident, the supervisor holds a debriefing with involved personnel{{#if ops.usesRestraint}}, and after any restraint, with the person served when they are willing,{{/if}} to support those affected, review what happened, and identify what could be done differently. Personnel are offered access to employee assistance or other support.

### Annual Analysis

At least annually, the {{roles.quality.title}} prepares a written analysis of all critical incidents. The analysis addresses:

- Causes of incidents
- Trends by type, location, program, time, and persons involved
- Actions for improvement
- Results of improvement actions taken
- Necessary education and training of personnel
- Prevention of recurrence
- Internal and external reporting requirements, and whether they were met

The analysis is reviewed by leadership{{#if agency.hasBoard}} and summarized for the {{agency.governingBody}}{{/if}}, and its findings feed into the performance improvement plan and personnel training.

## Responsibilities

- All personnel report incidents immediately and accurately.
- The {{roles.safety.title}} manages incident review and tracking.
- The {{roles.compliance.title}} ensures external reports are timely.
- The {{roles.quality.title}} leads root cause analyses and the annual analysis.

## Related Documents

- Abuse, Neglect, and Exploitation
- Health and Safety
- Incident report form and incident log
`,
};
