export default {
  id: 'person-centered-long-term-care',
  number: '3.25',
  section: 'SPECIFIC',
  standard: 'AS 3',
  topic: 'Person-Centered Long-Term Care Community',
  title: 'Person-Centered Long-Term Care Community',
  manuals: ['AS'],
  appliesIf: 'program.asPrograms contains "longTermCare"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'AS 3', topic: 'Long-term care community description', heading: 'Program Description' },
    { standard: 'AS 3', topic: 'Resident choice in daily routines', heading: 'Resident Choice in Daily Life' },
    { standard: 'AS 3', topic: 'Dining', heading: 'Dining' },
    { standard: 'AS 3', topic: 'Culture change and resident voice', heading: 'Culture Change and Resident Voice' },
    { standard: 'AS 3', topic: 'Family involvement', heading: 'Family Involvement' },
    { standard: 'AS 3', topic: 'Transitions', heading: 'Move-In and Transitions' },
    { standard: 'AS 3', topic: 'End-of-life care and advance directives', heading: 'Advance Directives and End-of-Life Care' },
    { standard: 'AS 3', topic: 'Outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Verify the Aging Services manual section and letter for the Person-Centered Long-Term Care Community standards; "AS 3" is a placeholder, and in some manual years these standards are a separate section. Nursing facilities must also meet federal requirements of participation (42 CFR Part 483) and state licensing; assisted living follows state rules. Those rules may set specific timeframes for care plan conferences, room changes, discharge notices, and advance directive handling that override the suggested defaults here (care conference within 14 days of move-in and at least quarterly, 30-day notice before a non-emergency room change or move-out, resident council at least monthly). Confirm whether the community has a hospice contract and name the provider in the program description.',
  body: `
## Purpose

To describe how {{agency.name}} operates a long-term care community where residents direct their own daily lives, relationships, and care, and where the setting feels like home rather than an institution.

## Scope

This policy applies to every resident, personnel member, and department of the long-term care community operated by {{agency.name}}, including nursing, dining, housekeeping, life enrichment, and administration. Rights, assessment, planning, and discharge requirements are in Policy 1.19 Rights of Persons Served, Policy 2.03 Assessment of Persons Served, Policy 2.04 Person-Centered Planning, and Policy 2.05 Transition and Discharge; this policy adds what is specific to community living.

## Program Description

The community serves {{list program.populationLabels}} who need ongoing personal care, nursing care, or supervision in a residential setting. Care is available 24 hours a day, every day. {{#if program.payers}}Funding sources include {{list program.payers}}.{{else}}Accepted payment sources are listed in the admission agreement.{{/if}}

## Resident Choice in Daily Life

Residents decide when they wake, go to bed, bathe, and eat, what they wear, how they spend their time, and who they spend it with. Personnel learn each resident's lifelong routines and preferences at move-in and record them in the person-centered plan so every shift honors them. Work assignments are organized around resident routines, not the reverse. Consistent assignment of caregivers to the same residents is used whenever possible so residents are cared for by people who know them.

Residents may decorate their rooms with their own belongings, have visitors at any time, have private space for visits and phone calls, and come and go from the community, with support where needed for safety. Any limit on a resident's choices is based on an individual assessment, discussed with the resident, documented in the plan, and reviewed regularly; it is never applied as a blanket rule.

## Dining

Dining is a social, enjoyable part of the day. Residents choose where, when, and with whom they eat, select from menu choices at each meal, and can get food and drinks outside regular mealtimes. Menus reflect resident input and cultural and religious preferences. Therapeutic diets and texture modifications are honored while preserving as much choice and dignity as possible, and a resident's informed decision to decline a recommended diet is respected and documented after the risks are explained.

## Culture Change and Resident Voice

{{agency.name}} is committed to moving away from institutional practices. Leadership reviews routines, policies, and the physical environment each year with residents and personnel to find practices that put schedules ahead of people (such as overhead paging, fixed bathing schedules, or medication passes that interrupt meals) and replaces them. A resident council meets at least monthly with a staff liaison, and leadership responds in writing to council concerns within 14 days. Direct care personnel take part in care planning and in decisions that affect their residents.

## Family Involvement

With the resident's consent, family members and other chosen supports are invited to care conferences, community events, and decision making. A family council is supported if families want one. Families are told promptly about significant changes in condition, falls, injuries, and room changes, consistent with the resident's wishes and Policy 2.10 Confidentiality and Release of Information.

## Move-In and Transitions

Before move-in, personnel visit or talk with the resident and family to learn about routines, history, and what makes the person feel at home. A care conference is held within 14 days of move-in and at least quarterly afterward. Room or roommate changes are made only with the resident's input and, except in an emergency, with at least 30 days' notice. Transfers to a hospital or other setting are accompanied by a written summary of the resident's needs, preferences, and advance directives, and personnel help the resident settle in again on return.

## Advance Directives and End-of-Life Care

At move-in and at each care conference, personnel offer residents information about advance directives and help them record their wishes about medical treatment, resuscitation, a health care decision maker, and where they want to be at the end of life. Copies are kept in the record and are quickly available to every shift. When a resident is nearing the end of life, the team focuses on comfort, pain and symptom control, spiritual and cultural wishes, and the presence of loved ones, coordinates with hospice when the resident chooses it, and supports family, residents, and personnel through grief and remembrance practices.

## Staffing and Qualifications

Staffing meets {{agency.stateName || "state"}} licensing requirements and is adjusted to resident needs. All personnel complete training in person-centered care, dementia care, resident rights, and end-of-life care at hire and at least annually.

## Outcomes Measured

The community tracks resident and family satisfaction, falls, hospitalizations, use of antipsychotic medications, weight loss, staff turnover and consistent assignment, and how often resident preferences recorded in the plan are honored. Results go to the {{roles.quality.title}}.

## Responsibilities

The {{roles.executive.title}} leads culture change. The {{roles.clinical.title}} oversees care planning, advance directives, and end-of-life care. The {{roles.rights.title}} supports the resident council. All personnel honor each resident's routines and choices.
`,
};
