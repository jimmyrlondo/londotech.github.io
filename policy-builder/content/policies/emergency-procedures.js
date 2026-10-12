export default {
  id: 'emergency-procedures',
  number: '1.13',
  section: 'ASPIRE',
  standard: '1.H',
  topic: 'Health and Safety',
  title: 'Emergency Procedures',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.H', topic: 'Written emergency procedures', heading: 'Emergency Procedures by Type' },
    { standard: '1.H', topic: 'Locations covered', heading: 'Locations Covered' },
    { standard: '1.H', topic: 'Evacuation routes and emergency postings', heading: 'Evacuation Routes and Postings' },
    { standard: '1.H', topic: 'Unannounced tests of emergency procedures', heading: 'Unannounced Drills' },
    { standard: '1.H', topic: 'Drill analysis and corrective action', heading: 'Drill Analysis and Corrective Action' },
    { standard: '1.H', topic: 'Continuity of services', heading: 'Continuity of Services' },
  ],
  consultantNotes: 'Section 1.H lettering may shift between manual years; verify the crosswalk. CARF expects unannounced tests of each emergency procedure at least annually, on each shift, at each location; confirm the current wording (some years require complete actual or simulated physical evacuation drills specifically). Residential sites are frequently subject to stricter state rules (for example monthly or quarterly fire drills, with overnight drills); confirm with the state licensing agency and adjust. Confirm local severe weather hazards (tornado vs. hurricane vs. earthquake) and tailor the natural disaster section. If the agency has an active shooter / workplace violence training vendor, name it. Locations list renders from the intake; ensure each site has posted routes.',
  body: `
## Purpose

{{agency.name}} plans for emergencies so that persons served, personnel, and visitors are protected and essential services continue. This policy establishes written emergency procedures, testing through unannounced drills, and the analysis of drills to improve readiness.

## Scope

This policy applies to all personnel and to every location operated by {{agency.name}}, as well as to services delivered in the community{{#if program.residential}} and in residential settings{{/if}}{{#if ops.transportation}}, including transportation in agency vehicles{{/if}}.

### Locations Covered

These procedures cover the following locations. Each location keeps a site-specific supplement with its floor plan, evacuation routes, assembly area, shelter area, and utility shutoff locations.

{{#each locations}}- **{{this.name}}**, {{this.address || "address on file"}}
{{/each}}
## Policy

{{agency.name}} maintains written procedures for each type of emergency it may reasonably face. Personnel are trained in these procedures at orientation and at least annually, and the procedures are tested through unannounced drills. The {{roles.safety.title}} keeps the procedures current and reviews them at least annually and after any actual emergency.

## Procedures

### Emergency Procedures by Type

**Fire.** Personnel follow the RACE sequence: rescue anyone in immediate danger, activate the alarm and call 911, contain the fire by closing doors, and evacuate or extinguish only if the fire is small and they are trained to do so. Everyone exits by the nearest safe route to the designated assembly area, where the person in charge accounts for all persons served, personnel, and visitors.

**Bomb threats.** The person receiving a threat keeps the caller talking, notes exact words, voice characteristics, and background sounds, and does not hang up. Personnel do not touch suspicious items or use radios or cell phones near them. The person in charge calls 911 and follows law enforcement direction on evacuation.

**Natural disasters.** For severe weather, personnel monitor alerts and move persons served to the designated shelter area, away from windows. For flooding, earthquakes, or other regional events, the person in charge follows public safety direction and the continuity steps below.

**Utility failures.** During a loss of power, heat, water, or telephone service, personnel check on the safety of persons served, use emergency lighting and backup communication, report the outage to the utility and the {{roles.safety.title}}, and relocate persons served if the location cannot remain safe.

**Medical emergencies.** Personnel call 911 for any life-threatening condition, provide first aid and CPR within their training, bring the person's emergency information to responders, and notify the supervisor and the person's emergency contact{{#if program.servesMinors}} or, for a minor, the parent or legal guardian{{/if}}.

**Violent or other threatening situations.** Personnel use de-escalation, remove others from danger, and call 911 when there is a risk of serious harm or a weapon is involved. If there is an active threat, personnel follow run, hide, fight guidance: evacuate if possible, lock or barricade if not, and act only as a last resort.

**Pandemics and public health emergencies.** The {{roles.safety.title}} monitors public health guidance and activates heightened infection control, screening, distancing, and alternative service delivery{{#if program.telehealth}}, including expanded telehealth,{{/if}} as needed. The {{roles.executive.title}} decides when to modify or suspend in-person services.

### Evacuation Routes and Postings

Evacuation routes, the location of fire extinguishers and first aid kits, and the assembly area are posted in visible locations at each site. Postings are written in plain language with symbols so they are understandable to persons served with limited reading ability. Each location also posts or keeps readily available a current emergency contact list with 911, poison control, utility companies, the building owner, and agency leadership.

### Unannounced Drills

Each emergency procedure is tested through an unannounced drill at least annually on each shift at each location. Drills may be actual or simulated, and at least one drill per location each year is a complete physical evacuation. {{#if program.residential}}At residential locations, drills include overnight hours and are scheduled at varying times so that every shift participates.{{/if}}

### Drill Analysis and Corrective Action

After each drill, the person in charge completes a drill report recording the date, time, shift, type of emergency, participants, time to complete, and any problems observed. The {{roles.safety.title}} reviews each report, identifies needed improvements such as additional training or equipment, assigns corrective actions, and tracks them to completion. Drill results are analyzed together at least annually for trends.

### Continuity of Services

When an emergency disrupts operations, the {{roles.executive.title}} or designee activates the continuity plan. Priorities are the safety of persons served, contact with persons served who rely on daily services, continuity of {{#if ops.administersMeds}}medications and {{/if}}essential supports, and protection of records. Personnel contact lists and lists of persons served with critical needs are kept current and accessible off site. Where needed, services are relocated, delivered remotely, or coordinated with partner providers, and persons served and stakeholders are informed of changes.

## Responsibilities

- The {{roles.safety.title}} maintains the procedures, schedules unannounced drills, and analyzes drill results.
- The supervisor or person in charge at each location directs the response and completes drill reports.
- All personnel know the procedures and their roles in them.

## Related Documents

- Health and Safety
- Critical Incidents
- Site-specific emergency supplements and drill reports
`,
};
