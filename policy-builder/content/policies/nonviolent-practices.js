export default {
  id: 'nonviolent-practices',
  number: '2.07',
  section: 'PROGRAM',
  standard: '2.F',
  topic: 'Promoting Nonviolent Practices',
  title: 'Promoting Nonviolent Practices',
  manuals: ['BH', 'ECS', 'AS', 'CYS', 'OTP'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '2.F', topic: 'Trauma-informed and positive approaches', heading: 'Trauma-Informed and Positive Approaches' },
    { standard: '2.F', topic: 'De-escalation', heading: 'De-Escalation' },
    { standard: '2.F', topic: 'Training of personnel', heading: 'Training of Personnel' },
    { standard: '2.F', topic: 'Debriefing', heading: 'Debriefing After Incidents' },
    { standard: '2.F', topic: 'Seclusion prohibited', heading: 'Seclusion Is Prohibited' },
    { standard: '2.F', topic: 'Response to imminent danger without restraint', heading: 'Responding to Imminent Danger', showIf: '!ops.usesRestraint' },
    { standard: '2.F', topic: 'Emergency safety interventions', heading: 'Emergency Safety Interventions', showIf: 'ops.usesRestraint' },
  ],
  consultantNotes: 'Standard letters follow the BH Section 2 numbering; letter assignments differ by manual and year. If the agency uses restraint, name the approved training curriculum (for example CPI Safety Intervention, Mandt, Ukeru, or a state-approved program) and confirm the time limits used here (physical hold released as soon as risk ends and never longer than 15 minutes without supervisor reassessment, guardian notification the same day, written report within 24 hours) against state rules, which are often stricter. Many state DD and children\'s licensing rules prohibit prone restraint and any restraint outside an approved behavior support plan; Ohio DD rules (OAC 5123-2-06) restrict use heavily. CYS programs may face federal rules (for example 42 CFR 483 Subpart G for PRTFs). Seclusion is prohibited in this template; if the agency operates a licensed setting that permits it, a separate policy is required.',
  body: `
## Purpose

To create an environment at {{agency.name}} where persons served and personnel are safe, where challenging situations are prevented or resolved without force, and where every person is treated with dignity.

## Scope

This policy applies to all programs, locations, and personnel of {{agency.name}}, including volunteers and contractors who have contact with persons served.

## Policy

{{agency.name}} is committed to nonviolent, trauma-informed, and positive approaches. Personnel focus on understanding the needs behind behavior, preventing crises, and responding with the least intrusive approach that keeps everyone safe. {{#if ops.usesRestraint}}Physical restraint is permitted only as an emergency safety intervention under the strict conditions in this policy.{{else}}{{agency.name}} does not use restraint of any kind.{{/if}}

## Procedures

### Trauma-Informed and Positive Approaches

Personnel recognize that many persons served have experienced trauma and that coercion, loss of control, and certain environments can trigger distress. Personnel:

- Learn each person's triggers, early warning signs, and calming strategies during assessment and record them in the person-centered plan
- Offer choices, explain what is happening, and give people time and space
- Use positive reinforcement and skill-building instead of punishment
- Arrange environments to reduce noise, crowding, and other stressors where possible
- Work with the person, and their family or guardian when appropriate, to develop a crisis or safety plan

When a person's behavior regularly places them or others at risk, the team develops a written positive behavior support plan based on a functional understanding of the behavior, approved as required by state rules.

### De-Escalation

When a person becomes distressed or agitated, personnel use verbal and nonverbal de-escalation: a calm voice and posture, active listening, acknowledging feelings, offering choices, reducing demands, giving physical space, removing others from the area, and inviting the person to use their own coping strategies. Personnel call for additional help early.

### Seclusion Is Prohibited

Seclusion, meaning involuntarily confining a person alone in a room or area they are prevented from leaving, is prohibited in all programs of {{agency.name}}. Mechanical and chemical restraint are also prohibited. Prohibited practices also include any intervention used as punishment, for staff convenience, or as a substitute for services, and any technique that restricts breathing or causes pain.

{{#if ops.usesRestraint}}### Emergency Safety Interventions

Physical restraint is used only as a last resort, only when a person's behavior presents an imminent risk of serious physical harm to themselves or others, and only after less restrictive measures have failed or are clearly not possible. It is never used for punishment, discipline, coercion, convenience, or to compensate for low staffing. The following conditions apply to every use:

- **Approved technique only.** Personnel use only the holds taught in the agency's approved training program. Prone (face-down) holds, holds that put pressure on the chest, back, neck, or airway, and holds that restrict breathing or speech are prohibited.
- **Trained personnel only.** Only personnel with current certification in the approved program may apply a hold.
- **Continuous monitoring.** A second staff member observes the person throughout for signs of physical or emotional distress, including breathing, skin color, and complaints of pain, and the hold ends immediately if distress appears.
- **Time limits.** The hold is released as soon as the imminent risk has passed. A hold may not continue beyond 15 minutes without reassessment by a supervisor, and any hold lasting that long is reviewed by the {{roles.clinical.title}}.
- **Medical follow-up.** After every restraint, personnel check the person for injury and arrange medical evaluation when there is any injury or complaint.
- **Documentation.** A written report is completed before the end of the shift and no later than 24 hours after the event. It describes the events leading up to the intervention, less restrictive measures tried, the technique used, start and end times, the names of personnel involved, monitoring observations, injuries, and follow-up.
- **Notification.** The supervisor is notified immediately. The guardian, or a family member the person has chosen, is notified the same day. External reports are made as required by {{compliance.licensingAgency || "the state licensing agency"}} and the critical incident policy.
- **Debriefing.** Debriefing with the person served and with personnel occurs as described below.
- **Review of every use.** The {{roles.clinical.title}} reviews every restraint within 2 business days to confirm that the policy was followed and to identify changes to the person's plan.
- **Annual analysis.** The {{roles.quality.title}} analyzes all uses of restraint at least annually for patterns by person, location, time, and personnel, and reports results and recommendations to leadership as part of performance improvement.

{{else}}### Responding to Imminent Danger

{{agency.name}} does not use physical, mechanical, or chemical restraint or seclusion under any circumstances. When a situation cannot be resolved through de-escalation and there is imminent danger of serious harm, personnel:

1. Move other persons served and personnel away from the danger.
2. Keep a safe distance and continue verbal de-escalation.
3. Call 911, or a local mobile crisis team when risk is not immediate, and follow the instructions of responders.
4. Notify the supervisor as soon as it is safe to do so.
5. Report the event under the critical incident policy.

Personnel do not physically hold, block, or carry a person served, except for brief physical contact needed to prevent immediate injury (such as guiding a person away from traffic), which is documented and reported.

{{/if}}### Debriefing After Incidents

After any crisis{{#if ops.usesRestraint}}, and after every use of restraint{{/if}}, personnel hold debriefings:

- With the person served, within 24 hours or as soon as they are ready, to talk about what happened, how they are feeling, what might help next time, and any changes they want in their plan
- With involved personnel, before the end of the shift when possible, to review what happened, check on their well-being, and identify what could be done differently

Lessons learned are reflected in the person's plan and in staff training.

### Training of Personnel

All personnel with direct contact receive training in trauma-informed care, positive approaches, and de-escalation before working alone with persons served and at least annually after that{{#if ops.usesRestraint}}. Personnel authorized to use emergency safety interventions also complete the approved certification program, including a hands-on competency demonstration, and recertify on the program's required schedule{{/if}}. The {{roles.hr.title}} maintains training records.

## Responsibilities

The {{roles.clinical.title}} oversees nonviolent practices and reviews incidents. Supervisors ensure staffing and training support safe practice. The {{roles.quality.title}} analyzes incident data.
`,
};
