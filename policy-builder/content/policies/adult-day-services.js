export default {
  id: 'adult-day-services',
  number: '3.23',
  section: 'SPECIFIC',
  standard: 'AS 3',
  topic: 'Adult Day Services',
  title: 'Adult Day Services',
  manuals: ['AS'],
  appliesIf: 'program.asPrograms contains "adultDay"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'AS 3', topic: 'Adult day program description', heading: 'Program Description' },
    { standard: 'AS 3', topic: 'Daily schedule and activities', heading: 'Daily Schedule and Activities' },
    { standard: 'AS 3', topic: 'Health monitoring', heading: 'Health Monitoring' },
    { standard: 'AS 3', topic: 'Nutrition and meals', heading: 'Nutrition and Meals' },
    { standard: 'AS 3', topic: 'Dementia-capable practices and wandering prevention', heading: 'Dementia-Capable Practices' },
    { standard: 'AS 3', topic: 'Caregiver communication', heading: 'Caregiver Communication' },
    { standard: 'AS 3', topic: 'Staffing', heading: 'Staffing and Qualifications' },
    { standard: 'AS 3', topic: 'Outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Verify the Aging Services manual section and letter for Adult Day Services; "AS 3" is a placeholder and AS numbering differs from BH and ECS. State adult day licensing or certification rules usually set the staff-to-participant ratio, nurse coverage, meal requirements, and activity hours: insert the state ratio (6:1 is a common default used here) and confirm. Other suggested defaults: health check on arrival each day, weight monthly, vital signs at least monthly or as ordered, missing-participant search escalated to 911 within 15 minutes, care plan review with caregivers at least every 6 months. If the agency serves persons with dementia, confirm required dementia training hours under state rules.',
  body: `
## Purpose

To describe how {{agency.name}} provides a safe, engaging, and health-supporting day program for adults who benefit from supervision and support during the day, while giving family caregivers reliable respite.

## Scope

This policy applies to the Adult Day Services program of {{agency.name}} and to all personnel who work in the adult day center. General requirements for assessment, planning, and discharge are found in Policy 2.03 Assessment of Persons Served, Policy 2.04 Person-Centered Planning, and Policy 2.05 Transition and Discharge.

## Program Description

The program serves {{list program.populationLabels}} who live at home and need daytime supervision, social connection, health monitoring, or help with daily activities. The center is open {{program.hours || "on the days and hours stated in the program description"}}.{{#if program.payers}} Funding sources include {{list program.payers}}.{{/if}} Participants may attend full or partial days on a schedule agreed with them and their caregivers.

## Eligibility and Admission

Adults are admitted when the program can safely meet their health, behavioral, and personal care needs. Before the first day, a nurse or qualified designee completes a health and functional assessment, gathers the participant's daily routines, preferences, and history, and obtains emergency contacts, physician information, and any advance directives. Admission follows Policy 2.02 Screening and Access to Services.

## Daily Schedule and Activities

Each day follows a posted schedule that balances group and individual activities, physical movement, rest, and meals. Activities are chosen with participants and reflect their interests, culture, and abilities, and may include exercise, music, art, games, reminiscence, gardening, outings, and opportunities to contribute through helping roles. Participants may decline any activity and are offered a quiet alternative. The schedule is reviewed monthly using participant feedback.

## Health Monitoring

Personnel observe each participant on arrival for changes in mood, appearance, skin, mobility, or alertness, and report changes to the program nurse the same day. The nurse monitors weight monthly and vital signs at least monthly or as ordered, and follows up on falls, skin concerns, or signs of illness. Personal care (toileting, incontinence care, grooming) is provided privately and respectfully according to the plan. When a participant becomes ill or is injured, personnel provide first aid, notify the caregiver, and call emergency services when needed.{{#if ops.medsAny}} Medications given or monitored during program hours are handled under Policy 2.06 Medication Management.{{/if}}

## Nutrition and Meals

The center serves a midday meal and snacks that meet the participant's prescribed diet, texture modifications, allergies, and cultural or religious preferences. Diet orders are posted where food is served. Personnel assist with eating as the plan requires, watch for choking or swallowing difficulty, and record intake for any participant whose plan calls for it. Fluids are offered throughout the day.

## Dementia-Capable Practices

All direct care personnel are trained to support persons living with dementia, including communication techniques, redirection, and responding to distress as a form of communication rather than as misbehavior. The environment uses clear signage, good lighting, and calm spaces. To prevent wandering and elopement:

- Each participant's risk of wandering is assessed at admission and whenever behavior changes
- Exits are monitored with door alarms or staff positioning, and doors are never secured in a way that violates fire code
- Personnel count participants at every transition, including outings and arrival and departure
- If a participant is missing, personnel search immediately, notify the program director, and call 911 and the caregiver if the participant is not found within 15 minutes

Participants are released only to persons named on the authorized pickup list.

## Caregiver Communication

Caregivers receive a daily communication (in person, note, or message) about anything notable that day. Personnel meet with the participant and caregiver at least every 6 months to review the plan, and sooner when needs change. The program shares information about caregiver support groups, respite options, and community resources.{{#if ops.transportation}} When the program provides rides, drivers report pickup and drop-off times and any concerns to center personnel.{{/if}}

## Staffing and Qualifications

The center maintains at least the participant-to-staff ratio required by {{agency.stateName || "state"}} rules (and no fewer than one direct care staff member for every 6 participants), with additional staff for outings and for participants with higher needs. A licensed nurse is on site or on call during program hours, as state rules require. All direct care personnel complete dementia, first aid, and CPR training before working alone with participants.

## Outcomes Measured

The program tracks attendance, falls, hospitalizations, caregiver satisfaction, participant satisfaction, and the length of time participants are able to remain living at home. Results are reported to the {{roles.quality.title}}.

## Responsibilities

The {{roles.clinical.title}} oversees the program, staffing, and plan reviews. The program nurse oversees health monitoring and nutrition. All center personnel follow wandering prevention and release procedures.
`,
};
