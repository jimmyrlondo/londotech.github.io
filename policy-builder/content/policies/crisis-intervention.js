export default {
  id: 'crisis-intervention',
  number: '3.05',
  section: 'SPECIFIC',
  standard: 'BH 3 / CYS 3',
  topic: 'Crisis Intervention',
  title: 'Crisis Intervention',
  manuals: ['BH', 'CYS'],
  appliesIf: 'program.bhPrograms contains "crisis" or program.cysPrograms contains "crisis"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'BH 3 / CYS 3', topic: 'Crisis Intervention: program description and 24-hour access', heading: 'Program Description' },
    { standard: 'BH 3 / CYS 3', topic: 'Crisis Intervention: eligibility', heading: 'Admission Criteria' },
    { standard: 'BH 3 / CYS 3', topic: 'Crisis Intervention: service components', heading: 'Service Components' },
    { standard: 'BH 3 / CYS 3', topic: 'Crisis Intervention: staffing and training', heading: 'Staffing and Qualifications' },
    { standard: 'BH 3 / CYS 3', topic: 'Crisis Intervention: response, risk assessment, and safety planning', heading: 'Service Delivery Procedures' },
    { standard: 'BH 3 / CYS 3', topic: 'Crisis Intervention: mobile response', heading: 'Mobile Response', showIf: 'program.settings contains "community" or program.settings contains "inhome"' },
    { standard: 'BH 3 / CYS 3', topic: 'Crisis Intervention: children and adolescents', heading: 'Children and Adolescents', showIf: 'program.cysPrograms contains "crisis" or program.populations contains "youth"' },
    { standard: 'BH 3 / CYS 3', topic: 'Crisis Intervention: law enforcement, hospitals, and 988', heading: 'Coordination of Care' },
    { standard: 'BH 3 / CYS 3', topic: 'Crisis Intervention: follow-up and closure', heading: 'Transition and Discharge Criteria' },
    { standard: 'BH 3 / CYS 3', topic: 'Crisis Intervention: outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Crisis Intervention is a Section 3 core program in both the BH and CYS manuals; verify the current section letters (BH also has separate Crisis and Information Call Centers standards, which apply if the agency operates a call center or 988 center rather than only crisis response). The Mobile Response section is turned on by the community-based or in-home service setting, which is only a proxy; confirm whether the agency actually runs mobile teams and edit accordingly. Suggested defaults to confirm against state crisis rules, 988 and county contracts: calls answered by a live person 24/7, mobile arrival within 60 minutes (urban) or 2 hours (rural), follow-up contact within 24 hours and no later than 72 hours, two-person mobile teams. Name the state\'s involuntary emergency evaluation statute (for example Ohio Revised Code 5122.10) and the local CIT program. If the agency is itself a 988 center, add the Vibrant/988 network standards.',
  body: `
## Purpose

To describe how {{agency.name}} responds to behavioral health crises at any hour, so that persons in crisis are safe, are connected to the least restrictive help that meets their needs, and are followed until they are linked to ongoing care.

## Scope

This policy applies to the crisis intervention program{{#if program.cysPrograms contains "crisis"}}, including crisis services for children, adolescents, and families,{{/if}} and to all personnel who answer crisis calls, respond in person, or supervise crisis services. The general program policies in Section 2 also apply.

## Program Description

Crisis intervention is available 24 hours a day, 7 days a week. A trained person answers every crisis call live; calls are never sent to voicemail. Services include telephone support, {{#if program.settings contains "community" or program.settings contains "inhome"}}mobile response in the community, {{/if}}walk-in assessment where offered, safety planning, and follow-up. Crisis services are never delayed to verify insurance or ability to pay.{{#if program.payers}} When a person has coverage, services are billed to the applicable payer, which may include {{list program.payers "or"}}.{{/if}}

## Admission Criteria

Anyone who contacts the program, or is referred by family, a school, law enforcement, a hospital, or 988, and reports a behavioral health crisis receives a response. A person who needs emergency medical care, or is in immediate danger, is connected to 911 at once while personnel stay on the line when possible.

## Service Components

- Telephone triage and de-escalation
- Risk assessment for suicide, harm to others, and other safety concerns, using a standardized tool
- A written safety plan developed with the person, including warning signs, coping strategies, people to call, and steps to reduce access to lethal means
- Referral and warm handoff to the least restrictive appropriate service
- Follow-up contact after every crisis episode
{{#if program.sud}}- Screening for intoxication and withdrawal risk, and naloxone education and distribution
{{/if}}
## Staffing and Qualifications

A licensed clinician is available for consultation at all times, in person or by phone, and approves every recommendation for hospitalization or involuntary evaluation. Crisis personnel complete training in suicide risk assessment, safety planning, de-escalation, trauma-informed care, and cultural responsiveness before working alone, and refresh it at least annually. Personnel are supervised and debriefed after high-risk events.

## Service Delivery Procedures

1. Personnel answer the call, assess immediate safety, and confirm the caller's location early.
2. Personnel complete the risk assessment and decide, with the on-call clinician when risk is moderate or high, on the response needed.
3. Personnel develop or update a safety plan with the person and, with consent, a support person.
4. When a higher level of care is needed, personnel arrange it and stay involved until the handoff is complete.
5. Every contact is documented in {{ops.ehrSystem || "the electronic health record"}} before the end of the shift.

{{#if program.settings contains "community" or program.settings contains "inhome"}}## Mobile Response

When an in-person response is needed, a mobile team of at least two personnel responds to the person's home, school, or other community location, arriving within 60 minutes in urban areas and 2 hours in rural areas. The team checks scene safety before entering, carries a charged phone, and checks in with the on-call supervisor at arrival and departure.

{{/if}}{{#if program.cysPrograms contains "crisis" or program.populations contains "youth"}}## Children and Adolescents

A parent or guardian is contacted as early as safety allows and takes part in the safety plan, unless contact would place the youth at risk. Personnel use developmentally appropriate language and coordinate with schools when the crisis occurs there. Suspected abuse or neglect is reported to {{compliance.cpsAgency || "the county child protective services agency"}} under Policy 1.21 Abuse, Neglect, and Exploitation.

{{/if}}## Coordination of Care

- **988.** The program accepts warm transfers from the 988 Suicide and Crisis Lifeline and refers callers to 988 for support between contacts.
- **Law enforcement.** Personnel request police only when there is imminent danger of violence, a weapon is involved, or a medical emergency requires it, and ask for officers trained in crisis intervention when available. Personnel share only what safety requires.
- **Hospitals.** When hospitalization or involuntary evaluation is needed, personnel follow {{agency.stateName || "state"}} law, call the receiving emergency department or hospital before arrival, and share the assessment with consent or as the law allows.
- **Existing providers.** With authorization, personnel notify the person's current providers the next business day.{{#if compliance.part2}} Substance use treatment information is disclosed only under 42 CFR Part 2, including its medical emergency exception.{{/if}}

## Transition and Discharge Criteria

A crisis episode closes when the immediate crisis has resolved and the person is linked to ongoing services or has chosen not to continue. Personnel contact every person served within 24 hours of the crisis contact, and no later than 72 hours, to check safety and confirm the referral. Transition follows Policy 2.05 Transition and Discharge.

## Outcomes Measured

- Calls answered live, and average speed of answer
{{#if program.settings contains "community" or program.settings contains "inhome"}}- Mobile response time against the targets in this policy
{{/if}}- Crises resolved in the community without hospitalization or law enforcement involvement
- Follow-up completed within 72 hours
- Linkage to ongoing services within 7 days

Results are reported to the {{roles.quality.title}} under Policy 1.23 Performance Measurement and Management.

## Responsibilities

The {{roles.clinical.title}} oversees crisis services and maintains the on-call schedule. On-call clinicians approve high-risk decisions. Crisis personnel respond, document, and complete follow-up as described in this policy.
`,
};
