export default {
  id: 'accessibility',
  number: '1.22',
  section: 'ASPIRE',
  standard: '1.L',
  topic: 'Accessibility',
  title: 'Accessibility',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.L', topic: 'Accessibility plan and barrier categories', heading: 'Accessibility Plan' },
    { standard: '1.L', topic: 'Requests for reasonable accommodation', heading: 'Reasonable Accommodation Requests' },
    { standard: '1.L', topic: 'Annual accessibility status report', heading: 'Annual Status Report' },
  ],
  consultantNotes: 'Section 1.L lettering may shift between manual years; verify the crosswalk and the current list of barrier categories. CARF expects the accessibility plan to include timelines for removing barriers and an annual status report; confirm the agency has a current written plan (a template plan is often needed as a separate document). Confirm ADA Title I (employment) and Title III or II obligations based on organization type. The 10-business-day accommodation decision timeframe is a recommended default.',
  body: `
## Purpose

{{agency.name}} identifies and removes barriers that limit access to its services, locations, and employment, so that persons served, personnel, and other stakeholders can participate fully.

## Scope

This policy applies to all locations{{#if multipleLocations}}, including each of the agency's sites{{/if}}, all programs, and all employment practices of {{agency.name}}.

## Policy

{{agency.name}} complies with the Americans with Disabilities Act, Section 504 of the Rehabilitation Act, and other applicable accessibility laws. The agency looks beyond legal minimums to identify any barrier that keeps persons served or personnel from full participation. The {{roles.safety.title}} coordinates the accessibility plan with input from the {{roles.hr.title}}, the {{roles.rights.title}}, and the {{roles.it.title}}.

## Procedures

### Identifying Barriers

At least annually, the agency gathers input on barriers from persons served, personnel, and other stakeholders through satisfaction surveys, grievances, accommodation requests, self-inspections, and direct conversations. The assessment considers the following areas:

- **Architecture:** building entrances, parking, restrooms, doorways, and routes within each location
- **Environment:** lighting, noise, signage, sensory considerations, and safety of surroundings
- **Attitudes:** stigma, assumptions, and language that discourage participation, among personnel and in the community
- **Finances:** costs or payment practices that limit access to services
- **Employment:** barriers in recruitment, hiring, and advancement for persons with disabilities{{#if program.ECS}} and for persons served seeking work{{/if}}
- **Communication:** language access, plain language, alternative formats, interpreters, and communication supports
- **Technology:** accessibility of websites, electronic forms, {{#if program.telehealth}}telehealth platforms, {{/if}}and assistive technology
- **Transportation:** the ability of persons served to get to and from services
- **Community integration:** opportunities for persons served to take part in community life
- **Other barriers** identified by persons served, personnel, or stakeholders

### Accessibility Plan

The {{roles.safety.title}} maintains a written accessibility plan that lists each identified barrier, the action to remove or reduce it, the responsible position, and a timeline. When a barrier cannot be removed right away, the plan describes how access is provided in the meantime, such as delivering services at another location or in the community. The plan is reviewed and updated at least annually.

### Reasonable Accommodation Requests

**Persons served.** Persons served{{#if program.servesMinors}}, or parents and guardians on their behalf,{{/if}} may request an accommodation from any personnel member, verbally or in writing. The supervisor or {{roles.rights.title}} responds promptly, works with the person to find an effective accommodation, documents the request and the outcome, and explains any denial along with alternatives and the right to file a grievance.

**Personnel and applicants.** Personnel and job applicants may request an accommodation from the {{roles.hr.title}}. The {{roles.hr.title}} engages in an interactive process with the individual, may request documentation of need when the disability is not obvious, and decides the request within 10 business days when possible. Medical information is kept confidential and separate from personnel files.

Requests and their outcomes are logged so that patterns can inform the accessibility plan.

### Annual Status Report

At least annually, the {{roles.safety.title}} prepares a written accessibility status report that summarizes barriers identified, progress made in removing them, accommodation requests received and their outcomes, and barriers that remain with updated timelines. The report is reviewed by leadership{{#if agency.hasBoard}} and shared with the {{agency.governingBody}}{{/if}} and is used in strategic and budget planning.

## Responsibilities

- The {{roles.safety.title}} coordinates the accessibility plan and annual status report.
- The {{roles.hr.title}} manages personnel and applicant accommodation requests.
- The {{roles.rights.title}} supports accommodation requests from persons served.
- The {{roles.executive.title}} allocates resources to remove barriers.

## Related Documents

- Accessibility plan
- Accommodation request form and log
- Technology and Information Security
`,
};
