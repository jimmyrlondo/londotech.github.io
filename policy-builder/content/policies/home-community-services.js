export default {
  id: 'home-community-services',
  number: '3.24',
  section: 'SPECIFIC',
  standard: 'AS 3',
  topic: 'Home and Community Services',
  title: 'Home and Community Services',
  manuals: ['AS'],
  appliesIf: 'program.asPrograms contains "homeCommunity"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'AS 3', topic: 'Home and community program description', heading: 'Program Description' },
    { standard: 'AS 3', topic: 'Home safety assessment', heading: 'Home Safety Assessment' },
    { standard: 'AS 3', topic: 'Service plans and aide assignments', heading: 'Service Plans and Aide Assignments' },
    { standard: 'AS 3', topic: 'Supervisory visits', heading: 'Supervisory Visits' },
    { standard: 'AS 3', topic: 'Missed and late visits', heading: 'Missed and Late Visits' },
    { standard: 'AS 3', topic: 'Caregiver support', heading: 'Caregiver Support' },
    { standard: 'AS 3', topic: 'Worker safety in the home', heading: 'Worker Safety in the Home' },
    { standard: 'AS 3', topic: 'Outcomes', heading: 'Outcomes Measured' },
    { standard: 'AS 3', topic: 'Electronic visit verification', heading: 'Electronic Visit Verification', showIf: 'ops.evv' },
  ],
  consultantNotes: 'Verify the Aging Services manual section and letter for Home and Community Services; "AS 3" is a placeholder. Supervisory visit frequency is commonly set by state home care licensing and Medicaid waiver rules (for example every 60 or 90 days, and within a set period of a new aide starting); the 60-day default here must be confirmed. Other defaults: home safety assessment before or at the first visit, aide must call the scheduler if running more than 15 minutes late, missed-visit notice to the person within 30 minutes of the scheduled start, missed visits reviewed weekly. The Electronic Visit Verification subsection prints only when the intake marks EVV; confirm the state EVV model (state-sponsored or alternate vendor), the rules for manual edits and reason codes, and the weekly exception review default against the state Medicaid EVV requirements.',
  body: `
## Purpose

To describe how {{agency.name}} provides in-home aide and community support services that help older adults and adults with disabilities live safely and as independently as they choose in their own homes.

## Scope

This policy applies to the Home and Community Services program of {{agency.name}}, including schedulers, aides, nurses or supervisors, and program managers. General assessment, planning, records, and discharge requirements are in Policy 2.03 Assessment of Persons Served, Policy 2.04 Person-Centered Planning, Policy 2.08 Records of the Persons Served, and Policy 2.05 Transition and Discharge.

## Program Description

The program serves {{list program.populationLabels}} in their homes and communities. Services may include help with bathing, dressing, grooming, toileting, mobility, light housekeeping, laundry, meal preparation, errands, and companionship. Visits are scheduled {{program.hours || "at times agreed with each person served, as stated in the program description"}}.{{#if program.payers}} Funding sources include {{list program.payers}}.{{/if}}

## Eligibility and Admission

A person is admitted when the agency can safely meet their needs in the home with available staff. A supervisor or nurse visits the home before services start to complete the assessment and home safety assessment, and to learn the person's routines and preferences. Admission follows Policy 2.02 Screening and Access to Services.

## Home Safety Assessment

At or before the first visit, and again at each plan review, the supervisor reviews the home with the person served for fall hazards, lighting, bathroom safety, smoke and carbon monoxide detectors, fire exits, oxygen use, safe food storage, pests, and pets. Recommendations are shared with the person, who decides which to act on. Hazards that could seriously harm the person or the aide are discussed with the person and, with consent, their family, and the plan states how services will be delivered safely.

## Service Plans and Aide Assignments

Each person has a written service plan listing the tasks to be done at each visit, the schedule, preferences for how care is given, and any precautions. The plan is kept in the home or available to the aide through {{ops.ehrSystem || "the agency's electronic record"}}. Aides perform only tasks on the plan and within their training. The scheduler assigns consistent aides whenever possible, honors reasonable preferences (including the gender of the aide for personal care), and introduces any new aide before or at the first visit.{{#if ops.medsAny}} Any medication reminders or assistance follow Policy 2.06 Medication Management and the limits of the aide's role under state rules.{{/if}}{{#if ops.clientFunds}} Errands involving the person's money follow Policy 1.10 Funds of Persons Served, with receipts returned to the person.{{/if}}

## Supervisory Visits

A supervisor visits each home at least every 60 days, or more often if required by {{agency.stateName || "state"}} rules or the payer, and within 14 days after a new aide begins. Supervisory visits check that the plan is followed, ask the person about satisfaction, observe the aide's skills when the aide is present, and update the plan and home safety assessment as needed. Concerns about an aide's performance are addressed through supervision and retraining.

## Missed and Late Visits

Aides call the scheduler as soon as they know they will be more than 15 minutes late. If a visit cannot be covered, the scheduler notifies the person or caregiver within 30 minutes of the scheduled start, offers a replacement aide or a new time, and, for persons who would be at risk without the visit, contacts their backup caregiver named in the plan. Every missed visit is documented with the reason. The program manager reviews missed-visit data weekly.

{{#if ops.evv}}### Electronic Visit Verification

Every visit is captured in real time through {{ops.evvSystem || "the state-approved EVV system"}}: the worker checks in and out at the start and end of the visit, which records the service, the person served, the worker, the date, the location, and the start and end times. When a visit cannot be captured in real time, or a record needs correcting, the worker enters a manual edit with the reason for the change, and the supervisor reviews and approves the edit before the visit is billed. The supervisor reviews EVV exceptions (missed or late check-ins, visits shorter or longer than scheduled, location mismatches, and manual edits) at least weekly and follows up on patterns with the worker. Only verified visits are billed, and EVV records are reconciled to claims to protect billing integrity.

{{/if}}## Caregiver Support

Family caregivers are included in planning when the person served agrees. Personnel share information on respite, caregiver training, support groups, and community resources, and watch for signs of caregiver strain, offering referrals when they see them.

## Worker Safety in the Home

Aides receive training in body mechanics, infection control, recognizing unsafe situations, and de-escalation. Before each visit the aide knows any known risks noted in the plan. Aides may leave a home where they feel unsafe (for example threats, weapons displayed, violence, or impairment of others in the home), after which they notify the supervisor immediately and the supervisor follows up with the person served the same day. Aides check in and out of each visit so the agency knows where they are. Injuries are reported under Policy 1.12 Health and Safety.{{#if ops.transportation}} Aides who drive persons served follow Policy 1.15 Transportation of Persons Served.{{/if}}

## Outcomes Measured

The program tracks visits completed as scheduled, missed and late visits, falls and hospitalizations, aide turnover and consistency, and satisfaction of persons served and caregivers. Results are reported to the {{roles.quality.title}}.

## Responsibilities

The {{roles.clinical.title}} oversees the program and supervisory visits. Supervisors complete assessments, plans, and visits. Schedulers manage coverage and missed visits. Aides deliver care as planned and report changes in condition the same day.
`,
};
