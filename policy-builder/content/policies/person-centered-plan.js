export default {
  id: 'person-centered-plan',
  number: '2.04',
  section: 'PROGRAM',
  standard: '2.C',
  topic: 'Person-Centered Plan',
  title: 'Person-Centered Planning',
  manuals: ['BH', 'ECS', 'AS', 'CYS', 'OTP'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '2.C', topic: 'Plan developed with the person served', heading: 'Developing the Plan' },
    { standard: '2.C', topic: 'Plan content: goals, objectives, services', heading: 'Plan Content' },
    { standard: '2.C', topic: 'Plan review and changes', heading: 'Plan Review and Changes' },
    { standard: '2.C', topic: 'Signatures and copy of plan', heading: 'Signatures and Copy of the Plan' },
    { standard: '2.C', topic: 'Progress notes linked to the plan', heading: 'Progress Notes' },
  ],
  consultantNotes: 'Standard letters follow the BH Section 2 numbering; letter assignments differ by manual and year. Timeframes (plan completed within 30 days of admission or within 14 days of the completed assessment, review at least every 90 days, progress notes within 2 business days) are suggested defaults: confirm against state licensing rules, Medicaid or waiver requirements (for example, ISP timelines set by a county board or state DD agency), and payer contracts. Some waiver programs require the plan to be written by an outside case manager; if so, this policy should describe how the agency contributes to and implements that plan.',
  body: `
## Purpose

To ensure each person served at {{agency.name}} has an individualized plan that reflects their own goals, is developed with them, and directs the services they receive.

## Scope

This policy applies to all programs of {{agency.name}} and to personnel who develop, carry out, or document services under a person-centered plan.

## Policy

Every person served has a written person-centered plan developed in partnership with them, based on their assessment and interpretive summary. The plan is written in language the person understands, guides every service provided, and is reviewed and updated as the person's needs and goals change.

## Developing the Plan

The plan is completed within 30 calendar days of admission, or within 14 calendar days after the assessment is completed, whichever is sooner, unless a payer or state rule requires a shorter timeframe. Personnel:

- Meet with the person served at a time and place that works for them
- Invite the people the person wants involved, such as family, a guardian, friends, peers, or other providers
- Use the strengths, needs, abilities, and preferences identified in the assessment
- Let the person lead the discussion of what they want to achieve
- Discuss choices of services, providers, and settings, including options outside {{agency.name}}
- Address risks identified in the assessment in a way that respects the person's choices

{{#if program.servesMinors}}For a child or adolescent, the parent or guardian participates in planning, and the youth's own goals and preferences are included in age-appropriate terms.

{{/if}}## Plan Content

Each plan includes:

- Goals written in the person's own words, describing what they want their life to look like
- Measurable objectives for each goal, with target dates, stated so that progress can be observed
- The specific services and supports to be provided, including type, frequency, and location
- The personnel or position responsible for each service
- The strengths and natural supports the person will use
- Any accommodations, communication needs, or cultural considerations
- Needs identified in the assessment that will not be addressed now, and why (for example, the person's choice or a referral elsewhere)
- Discharge or transition criteria and a preliminary transition plan
- The date of the next scheduled review

## Signatures and Copy of the Plan

The plan is signed and dated by the person served (or guardian, when one has authority), the primary staff member, and the supervising professional when required. If the person served declines to sign, personnel document the reason and how the person participated. The person served is offered a copy of the plan, in a format they can use, within 7 calendar days of signing, and the offer is documented.

## Progress Notes

Personnel document each service in a progress note within 2 business days. Each note:

- Identifies the date, duration, location, and type of service
- References the goal and objective addressed
- Describes what was done and how the person responded
- Notes progress, barriers, or new needs
- Is signed with the author's name and credential

When progress notes show that a goal is met, no longer fits, or is not progressing, personnel bring this to the team for plan review.

## Plan Review and Changes

The plan is reviewed with the person served at least every 90 days, or more often when the program description or payer requires it. A review is also held when the person requests one, when needs or risks change significantly, after a hospitalization, crisis, or critical incident, or when goals are achieved. Reviews document progress toward each objective and whether services should continue, change, or end.

Changes to goals, objectives, services, or frequency are made with the participation of the person served, documented as a plan update or addendum, and signed in the same way as the original plan.

## Procedures

1. The assigned staff member schedules the planning meeting after the assessment.
2. The plan is drafted with the person served and reviewed by the supervisor when required.
3. Signatures are obtained and a copy is offered.
4. Services are delivered and documented in progress notes linked to plan objectives.
5. Reviews are scheduled and completed at least every 90 days.

## Responsibilities

The {{roles.clinical.title}} establishes plan formats and oversees timeliness. Assigned staff develop and implement plans. Supervisors review plan quality, and the {{roles.quality.title}} monitors compliance through the records review process.
`,
};
