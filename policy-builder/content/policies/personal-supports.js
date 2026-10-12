export default {
  id: 'personal-supports',
  number: '3.16',
  section: 'SPECIFIC',
  standard: 'ECS 3',
  topic: 'Personal Supports',
  title: 'Personal Supports',
  manuals: ['ECS'],
  appliesIf: 'program.ecsPrograms contains "personalSupports"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'ECS 3', topic: 'Personal Supports: program description', heading: 'Program Description' },
    { standard: 'ECS 3', topic: 'Personal Supports: eligibility', heading: 'Eligibility' },
    { standard: 'ECS 3', topic: 'Personal Supports: assistance with daily living activities', heading: 'Service Components' },
    { standard: 'ECS 3', topic: 'Personal Supports: dignity, privacy, and personal care', heading: 'Dignity and Privacy in Personal Care' },
    { standard: 'ECS 3', topic: 'Personal Supports: self-direction and choice of personnel', heading: 'Self-Direction' },
    { standard: 'ECS 3', topic: 'Personal Supports: personnel training and delegated tasks', heading: 'Staffing, Training, and Delegation' },
    { standard: 'ECS 3', topic: 'Personal Supports: service delivery and documentation', heading: 'Service Delivery Procedures' },
    { standard: 'ECS 3', topic: 'Personal Supports: electronic visit verification', heading: 'Electronic Visit Verification', showIf: 'ops.evv' },
    { standard: 'ECS 3', topic: 'Personal Supports: outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Section reference is a best estimate: Personal Supports appears among the community services standards in Section 3 of the ECS manual; verify the letter against the current manual. Nurse delegation rules differ widely by state: confirm which health-related tasks (for example tube feeding, catheter care, insulin, ostomy care) unlicensed personnel may perform, the delegation and training records required, and how often the delegating nurse must reassess (for Ohio DD, OAC 5123-6 delegated nursing and Ohio Board of Nursing rules). Suggested defaults: competency check before working alone and annually, supervisor visit at least quarterly, missed visit coverage within 2 hours. If the program serves self-directed (participant-directed) waiver budgets where the person is the employer of record, add a section on the agency\'s role as agency with choice or fiscal intermediary. The Electronic Visit Verification subsection prints only when the intake marks EVV; confirm the state EVV model (state-sponsored or alternate vendor), the rules for manual edits and reason codes, and the weekly exception review default against the state Medicaid EVV requirements.',
  body: `
## Purpose

To describe how {{agency.name}} provides personal supports that help persons served with daily living tasks in a way that respects their dignity, privacy, and control over their own lives.

## Scope

This policy applies to personnel who provide or supervise personal supports. Assessment, planning, rights, and discharge are covered in Policy 2.03 Assessment of Persons Served, Policy 2.04 Person-Centered Planning, Policy 1.19 Rights of Persons Served, and Policy 2.05 Transition and Discharge. This policy adds what is specific to personal supports.

## Program Description

Personal supports are provided in the person's home, at work, and in the community, wherever the person needs help to carry out daily activities. Support is scheduled around the person's routines and preferences, not the agency's. The office is open {{program.hours || "during regular business hours"}}, and a supervisor is on call when supports are scheduled outside those hours.

{{#if program.payers}}Personal supports are funded through {{list program.payers}}, and personnel follow each payer's authorization and documentation rules.

{{/if}}## Eligibility

The program serves {{list program.populationLabels}} who need help with activities of daily living or instrumental activities of daily living to live, work, or take part in their community. {{#if program.populations contains "idd"}}Persons funded through a developmental disabilities waiver have the service authorized in their individual service plan before it begins. {{/if}}{{#if program.servesMinors}}For a minor, a parent or guardian consents to services and is present or reachable as the plan specifies. {{/if}}

## Service Components

As set in each plan, personal supports may include:

- Bathing, dressing, grooming, toileting, and eating
- Mobility, positioning, and transfers, using any equipment the person relies on
- Meal planning and preparation, housekeeping, laundry, and shopping
- Managing appointments, mail, and household routines
- Support to use the phone, technology, and community resources
- Teaching skills so the person can do more on their own, when that is their goal

## Dignity and Privacy in Personal Care

- Personnel ask before helping and explain each step.
- The person decides how tasks are done, in what order, and how much help they want.
- Doors are closed and the person is covered as much as possible during personal care.
- The person's preference for the gender of the personnel who help with intimate care is honored whenever possible.
- Personnel use respectful language and never discuss a person's care in front of others.
- Personnel encourage the person to do every part of a task they can do themselves.

## Self-Direction

Persons served choose when supports happen, how they are carried out, and, as much as possible, who provides them. They take part in interviewing and selecting their personnel and can ask for a change at any time without having to justify it. Supports build on the person's own routines and the help they already get from family and friends.

## Staffing, Training, and Delegation

Personnel meet the qualifications in their job description and any state rule. Before working alone, they complete training on the person's plan, rights, abuse reporting, infection control, safe transfers, and emergency procedures, and a supervisor observes and confirms their competence. Health-related tasks are performed only when state law allows unlicensed personnel to perform them, after training by a licensed nurse, and with nurse delegation and oversight when the law requires it. {{#if ops.medsAny}}Help with medications follows Policy 2.06 Medication Management. {{/if}}

## Service Delivery Procedures

1. Supports are delivered on the schedule in the plan, and personnel arrive on time.
2. Personnel document each visit, including the time, tasks completed, and how the person responded.
3. Changes in skin condition, health, eating, or mood are reported to the supervisor the same day.
4. When personnel cannot work a scheduled visit, the supervisor arranges coverage within 2 hours or contacts the person to agree on another time.
5. A supervisor visits at least quarterly to observe supports and ask the person how supports are going.{{#if ops.transportation}}
6. Transporting the person follows Policy 1.15 Transportation of Persons Served.{{/if}}{{#if ops.clientFunds}}

When personnel shop or pay bills for a person, they follow Policy 1.10 Funds of Persons Served.{{/if}}

{{#if ops.evv}}### Electronic Visit Verification

Every visit is captured in real time through {{ops.evvSystem || "the state-approved EVV system"}}: the worker checks in and out at the start and end of the visit, which records the service, the person served, the worker, the date, the location, and the start and end times. When a visit cannot be captured in real time, or a record needs correcting, the worker enters a manual edit with the reason for the change, and the supervisor reviews and approves the edit before the visit is billed. The supervisor reviews EVV exceptions (missed or late check-ins, visits shorter or longer than scheduled, location mismatches, and manual edits) at least weekly and follows up on patterns with the worker. Only verified visits are billed, and EVV records are reconciled to claims to protect billing integrity.

{{/if}}## Transition and Discharge

Supports change as the person's needs change and end when the person chooses or no longer needs them. Transitions follow Policy 2.05 Transition and Discharge.

## Outcomes Measured

At least quarterly, the program measures visits delivered as scheduled, missed visits, progress toward independence goals, incidents, and satisfaction of persons served. Results are reported to the {{roles.quality.title}}.

## Responsibilities

- {{roles.clinical.title}}: oversees the program and nurse delegation.
- Supervisors: schedule supports, confirm competence, and visit persons served.
- Direct support personnel: provide and document supports as described in each plan.
`,
};
