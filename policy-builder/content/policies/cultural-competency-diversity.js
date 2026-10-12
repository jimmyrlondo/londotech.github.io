export default {
  id: 'cultural-competency-diversity',
  number: '1.03',
  section: 'ASPIRE',
  standard: '1.A',
  topic: 'Leadership',
  title: 'Cultural Competency and Diversity',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.A', topic: 'Cultural competency and diversity plan', heading: 'Cultural Competency and Diversity Plan' },
    { standard: '1.A', topic: 'Plan addresses persons served', heading: 'Persons Served' },
    { standard: '1.A', topic: 'Plan addresses personnel', heading: 'Personnel' },
    { standard: '1.A', topic: 'Plan addresses other stakeholders', heading: 'Other Stakeholders' },
    { standard: '1.A', topic: 'Language access', heading: 'Language Access and Interpreters' },
    { standard: '1.A', topic: 'Annual review of the plan', heading: 'Annual Review and Update' },
  ],
  consultantNotes: 'The plan itself is a separate written document that must exist; this policy describes it. Confirm it addresses each diversity dimension listed in the current 1.A standard (verify the exact list against the manual year). Confirm the agency has an interpreter vendor contract and TTY/relay access. Recipients of federal funds (including Medicaid) must meet Title VI / Section 1557 language access obligations; confirm required nondiscrimination notices and taglines are posted. Confirm the annual cultural competency training requirement (suggested annually) matches the training plan.',
  body: `
## Purpose

This policy establishes how {{agency.name}} understands and responds to the diversity of the people it serves, employs, and works with, so that services are respectful, accessible, and effective for everyone.

## Scope

This policy applies to all programs, locations, and personnel, and to the agency's relationships with persons served, families{{#if program.servesMinors}} and guardians{{/if}}, referral sources, funders, and the community.

## Policy

{{agency.name}} maintains a written cultural competency and diversity plan. The plan recognizes and responds to differences in culture, ethnicity, race, age, gender, gender identity, sexual orientation, spiritual beliefs, socioeconomic status, language, and disability. {{agency.name}} does not discriminate on any of these bases in services, employment, or business relationships.

## Procedures

### Cultural Competency and Diversity Plan

The {{roles.executive.title}} assigns the {{roles.quality.title}} to lead development of the plan with input from persons served, personnel, and stakeholders. The plan:

1. Describes the diversity of the communities served{{#if multipleLocations}} at each location{{/if}}, using census data, referral data, and the demographics of current persons served.
2. Compares that profile to the diversity of personnel and leadership{{#if agency.hasBoard}}, including the {{agency.governingBody}}{{/if}}.
3. Identifies barriers to access or engagement, such as language, transportation, cost, stigma, or service hours.
4. Sets specific, measurable goals and actions for the year, with a responsible position for each.

### Persons Served

- At intake, personnel ask about and record each person's preferred language, cultural or spiritual practices, preferred name and pronouns, and any preferences that should shape services.
- Service plans reflect the person's culture, values, and preferences, and personnel invite the person to include family or community supports as the person chooses.
- Forms, signage, and educational materials are written in plain language and are available in the languages most commonly spoken by persons served.
- Satisfaction and outcome data are reviewed by demographic group to identify any group that is not being served well.
{{#if program.servesMinors}}
- For children and youth, services consider the culture and practices of the family, and personnel work with parents or guardians in a way that respects the family's values.
{{/if}}

### Personnel

- Recruitment is designed to build a workforce that reflects the communities served, including outreach through diverse job boards and community organizations.
- All personnel complete cultural competency training at orientation and annually.
- Supervisors discuss cultural considerations in case review and supervision.
- Reasonable accommodations are provided for disability and for religious practice.
- Personnel may raise concerns about bias or discrimination through supervisors, the {{roles.hr.title}}, or the compliance reporting line without fear of retaliation.

### Other Stakeholders

Leadership seeks input from community organizations, advocacy groups, and cultural leaders when planning services, and considers the diversity of vendors, partners, and advisory members.

### Language Access and Interpreters

{{agency.name}} provides language assistance at no cost to persons served and their families.

1. Qualified interpreters, in person, by video, or by telephone, are used for persons with limited English proficiency and for persons who are deaf or hard of hearing. Sign language interpreters are arranged in advance for scheduled services.
2. Family members, friends, and minors are not used as interpreters, except in an emergency or when the person served, after being offered a qualified interpreter at no cost, requests it for a non-clinical matter. The choice is documented.
3. Vital documents, such as consent forms, rights notices, and grievance procedures, are translated or interpreted orally.
4. TTY or relay services and accessible formats (large print, audio, or easy-read versions) are available on request.
{{#if program.telehealth}}
5. The telehealth platform ({{ops.telehealthPlatform || "the agency's telehealth platform"}}) supports a third participant so an interpreter can join sessions.
{{/if}}

The {{roles.rights.title}} maintains the list of interpreter resources and logs each use for the annual review.

### Annual Review and Update

The {{roles.quality.title}} reviews the plan at least annually. The review covers progress on each goal, changes in the demographics of persons served and personnel, interpreter use, and related complaints or grievances. The updated plan is approved by the {{roles.executive.title}}{{#if agency.hasBoard}} and reported to the {{agency.governingBody}}{{/if}}, and a summary is shared with personnel.

## Responsibilities

- {{roles.executive.title}}: ensures the plan has leadership support and resources.
- {{roles.quality.title}}: develops, monitors, and updates the plan.
- {{roles.hr.title}}: leads diverse recruitment and tracks training completion.
- {{roles.rights.title}}: coordinates language access.

## Related Documents

- Cultural Competency and Diversity Plan (current year)
- Interpreter resource list and log
- Nondiscrimination notice
`,
};
