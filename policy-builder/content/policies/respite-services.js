export default {
  id: 'respite-services',
  number: '3.17',
  section: 'SPECIFIC',
  standard: 'ECS 3',
  topic: 'Respite Services',
  title: 'Respite Services',
  manuals: ['ECS'],
  appliesIf: 'program.ecsPrograms contains "respite"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'ECS 3', topic: 'Respite Services: program description, in-home and out-of-home', heading: 'Program Description' },
    { standard: 'ECS 3', topic: 'Respite Services: eligibility and access, planned and emergency', heading: 'Eligibility and Access' },
    { standard: 'ECS 3', topic: 'Respite Services: information gathered before each stay', heading: 'Information Gathered on Each Person' },
    { standard: 'ECS 3', topic: 'Respite Services: supports provided', heading: 'Service Components' },
    { standard: 'ECS 3', topic: 'Respite Services: personnel', heading: 'Staffing and Qualifications' },
    { standard: 'ECS 3', topic: 'Respite Services: communication with caregivers', heading: 'Communication with Caregivers' },
    { standard: 'ECS 3', topic: 'Respite Services: service delivery', heading: 'Service Delivery Procedures' },
    { standard: 'ECS 3', topic: 'Respite Services: electronic visit verification', heading: 'Electronic Visit Verification', showIf: 'ops.evv' },
    { standard: 'ECS 3', topic: 'Respite Services: outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Section reference is a best estimate: Respite Services appears among the community services standards in Section 3 of the ECS manual; verify the letter against the current manual. Respite stays are usually short, so CARF and most payers allow a streamlined intake instead of a full assessment and plan; confirm how the current manual treats assessment and planning for respite and adjust the reference to Policies 2.03 and 2.04. Suggested defaults: respite information sheet updated at least annually and confirmed before every stay, emergency respite response within 24 hours when capacity allows, written summary to the caregiver at the end of each stay. Out-of-home respite in a facility may require a residential license (for Ohio DD, confirm OAC 5123 respite and ICF or licensed residential rules); in-home respite in the family home follows the family\'s household rules. The Electronic Visit Verification subsection prints only when the intake marks EVV; confirm the state EVV model (state-sponsored or alternate vendor), the rules for manual edits and reason codes, and the weekly exception review default against the state Medicaid EVV requirements.',
  body: `
## Purpose

To describe how {{agency.name}} provides respite that gives family members and other unpaid caregivers a break while the person served receives safe, familiar, and enjoyable support.

## Scope

This policy applies to personnel who provide or coordinate respite and to any site where out-of-home respite is provided. Rights, records, and incident reporting are covered in Policy 1.19 Rights of Persons Served, Policy 2.08 Records of the Persons Served, and Policy 1.14 Critical Incidents. This policy adds what is specific to respite.

## Program Description

Respite is short-term support for a person served when their usual caregiver needs time away. It is offered:

- **In-home:** personnel come to the family home and follow the family's routines.
- **Out-of-home:** the person stays at a respite site or approved respite home{{#if program.residential}}, which meets the same safety requirements as the agency's residential settings{{/if}}, or takes part in community activities.

Respite may be planned in advance or provided on short notice in an emergency. The office is open {{program.hours || "during regular business hours"}}, and requests for emergency respite are accepted at any time through the on-call supervisor.

{{#if program.payers}}Respite is funded through {{list program.payers}}, and personnel follow each payer's authorization and documentation rules.

{{/if}}## Eligibility and Access

The program serves {{list program.populationLabels}} who live with a family member or other unpaid caregiver. {{#if program.populations contains "idd"}}Persons funded through a developmental disabilities waiver have respite authorized in their individual service plan. {{/if}}{{#if program.servesMinors}}For children and adolescents, the parent or guardian requests and consents to respite. {{/if}}

1. **Planned respite** is requested at least 7 days ahead, and a schedule is confirmed in writing.
2. **Emergency respite** is used when a caregiver is suddenly unable to provide care because of illness, hospitalization, or a family emergency. The on-call supervisor responds within 24 hours when capacity allows, and refers the family to other resources when it does not.

## Information Gathered on Each Person

Because respite is short and personnel may not know the person well, a respite information profile is completed before the first stay, confirmed with the caregiver before every stay, and updated at least annually. It includes:

- Emergency contacts and the caregiver's availability during respite
- Physician, health conditions, allergies, and dietary needs
- Medications, dosages, and schedule{{#if ops.medsAny}}, handled according to Policy 2.06 Medication Management{{/if}}
- How the person communicates, including signs of pain, distress, or illness
- Daily routines, sleep, personal care, and preferences
- Favorite activities, things that comfort the person, and things to avoid
- Behavior support strategies in the person's plan, if any
- Legal guardianship and consent information

## Service Components

During respite, personnel provide supervision, personal care, meals, and activities the person enjoys, and follow the person's usual routines as closely as possible. Out-of-home stays include time in the community when the person wants it.

## Staffing and Qualifications

Respite personnel meet the qualifications in their job description and any state rule. Before providing respite alone, they complete training on rights, abuse reporting, emergency procedures, and the information profile of each person they will support. When possible, the same personnel support a person each time so the person sees a familiar face.

## Communication with Caregivers

At the start of each stay, personnel review the information profile with the caregiver and note any changes. During the stay, caregivers are contacted right away about any injury, illness, incident, or medication concern. At the end, personnel give the caregiver a written summary of how the stay went, including meals, sleep, activities, medications, and anything of concern.

## Service Delivery Procedures

1. Confirm the schedule, the information profile, and any authorization before the stay.
2. Inventory personal belongings, medications, and money brought for out-of-home stays, and return them at the end.
3. Document each stay, including times, supports provided, and the summary given to the caregiver.{{#if ops.transportation}}
4. Transportation to and from out-of-home respite follows Policy 1.15 Transportation of Persons Served.{{/if}}

{{#if ops.evv}}### Electronic Visit Verification

Every in-home respite visit is captured in real time through {{ops.evvSystem || "the state-approved EVV system"}}: the worker checks in and out at the start and end of the visit, which records the service, the person served, the worker, the date, the location, and the start and end times. When a visit cannot be captured in real time, or a record needs correcting, the worker enters a manual edit with the reason for the change, and the supervisor reviews and approves the edit before the visit is billed. The supervisor reviews EVV exceptions (missed or late check-ins, visits shorter or longer than scheduled, location mismatches, and manual edits) at least weekly and follows up on patterns with the worker. Only verified visits are billed, and EVV records are reconciled to claims to protect billing integrity.

{{/if}}## Outcomes Measured

At least quarterly, the program measures requests filled, emergency requests met, incidents, and caregiver and person satisfaction. Results are reported to the {{roles.quality.title}}.

## Responsibilities

- {{roles.clinical.title}}: oversees the program.
- Respite coordinators: schedule respite, maintain information profiles, and manage emergency requests.
- Respite personnel: provide and document respite and communicate with caregivers.
`,
};
