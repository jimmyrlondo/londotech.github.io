export default {
  id: 'program-structure',
  number: '2.01',
  section: 'PROGRAM',
  standard: '2.A',
  topic: 'Program/Service Structure',
  title: 'Program and Service Structure',
  manuals: ['BH', 'ECS', 'AS', 'CYS', 'OTP'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '2.A', topic: 'Written program descriptions', heading: 'Program Descriptions' },
    { standard: '2.A', topic: 'Services, populations, and settings', heading: 'Services, Populations, and Settings' },
    { standard: '2.A', topic: 'Team composition and qualifications', heading: 'Service Team Composition' },
    { standard: '2.A', topic: 'Coordination of services', heading: 'Coordination of Services' },
    { standard: '2.A', topic: 'Communication with persons served', heading: 'Communication with Persons Served' },
    { standard: '2.A', topic: 'Services designed around the persons served', heading: 'Person-Centered Design of Services' },
  ],
  consultantNotes: 'Standard letters follow the BH Section 2 numbering; letter assignments differ by manual (ECS, AS, CYS, OTP) and by standards year, so map the crosswalk to the agency\'s current manual. Each program named in program.serviceList needs its own written description (Appendix or program manual) containing every element listed under Program Descriptions; surveyors ask to see these. Confirm hours of operation, payer sources, and fee schedules with the agency. The annual review of descriptions is a suggested timeframe, not a mandated one.',
  body: `
## Purpose

To establish how {{agency.name}} defines, organizes, staffs, and coordinates each of its programs so that services are clearly described, consistently delivered, and built around the needs and choices of the persons served.

## Scope

This policy applies to every program and service operated by {{agency.name}} and to all personnel who plan, deliver, or supervise services.

## Policy

{{agency.name}} maintains a current written description of each program it offers. Services are designed with and around the persons served, delivered by a qualified team, and coordinated with other providers and natural supports the person chooses to involve. Program descriptions are reviewed at least {{admin.reviewFrequency}} and whenever a program changes in a meaningful way.

## Services, Populations, and Settings

{{agency.name}} currently offers the following programs and services: {{list program.serviceList}}.

Services are provided to {{list program.populationLabels}}, in {{list program.settingLabels}} settings.

{{#if multipleLocations}}Services are delivered at the following locations:

{{#each locations}}- {{this.name}} ({{this.address}}): {{this.services}}
{{/each}}{{/if}}

## Program Descriptions

The {{roles.clinical.title}} ensures that each program has a written description that is available to personnel, persons served, referral sources, and the public on request. Each description includes:

- The scope of services, including what the program does and does not provide
- The populations served, including age ranges and any eligibility or exclusion criteria
- The settings and locations where services are delivered
- Hours and days of operation, including after-hours or on-call access where applicable
- The typical frequency, intensity, and expected duration of services
- Payer sources accepted (for example Medicaid, Medicaid waiver, state or county funding, private insurance, and private pay)
- Fees charged to persons served, if any, and how fees are explained in advance
- Referral sources and how referrals are received
- The composition and qualifications of the service team
- How the program measures and reports outcomes

When a program description changes, the {{roles.clinical.title}} updates the written description, informs affected personnel, and notifies persons served of any change that affects their services.

## Service Team Composition

Each program is staffed by a team whose size and makeup match the needs of the persons served and the intensity of the service. The program description identifies each team role, the minimum credentials or licensure for that role, and the supervision structure. Teams may include licensed clinicians, direct support professionals, case managers, employment specialists, peer supporters, nurses, and prescribers, depending on the program.

The person served, and anyone the person chooses to include (such as family members, a guardian, or other supports), is recognized as a member of their own team.

## Coordination of Services

Personnel coordinate services within {{agency.name}} and with outside providers so that the person served experiences one connected plan rather than separate, competing ones. Coordination includes:

- Sharing information with other providers only with a valid authorization or as otherwise permitted by law
- Identifying a primary point of contact for each person served
- Holding team or case conferences when needs change or services overlap
- Documenting coordination activities in the record of the person served
- Making and following up on referrals for needs the program does not meet

## Communication with Persons Served

Personnel communicate with persons served in the language, format, and manner each person understands best. {{agency.name}} provides interpreters, translated materials, plain-language explanations, and communication supports (such as assistive technology or visual aids) at no cost to the person served. Personnel check for understanding instead of assuming it, and document any communication accommodations in the record.

## Person-Centered Design of Services

Services are designed around the strengths, needs, abilities, and preferences of each person served. Personnel ask persons served about their goals, cultural background, preferred times and locations for services, and who they want involved. Input from persons served, gathered through satisfaction surveys, advisory feedback, and day-to-day conversation, is used by program leadership to adjust service design, hours, and delivery methods.

## Procedures

1. The {{roles.clinical.title}} drafts or updates the written description for each program and submits it to the {{roles.executive.title}} for approval.
2. Approved descriptions are posted where personnel can find them and are provided to persons served and referral sources on request.
3. Program leadership reviews each description at least {{admin.reviewFrequency}}, using outcome data and feedback from persons served, and records the review date.
4. Before a new program begins or an existing program changes its scope, population, setting, or fees, the description is updated and approved.

## Responsibilities

The {{roles.executive.title}} approves program descriptions. The {{roles.clinical.title}} maintains descriptions, team structure, and coordination practices. The {{roles.quality.title}} provides outcome and satisfaction data used in program review. All personnel deliver services consistent with the approved program description.
`,
};
