export default {
  id: 'leadership-structure',
  number: '1.01',
  section: 'ASPIRE',
  standard: '1.A',
  topic: 'Leadership',
  title: 'Leadership Structure and Guidance',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.A', topic: 'Leadership structure', heading: 'Leadership Structure' },
    { standard: '1.A', topic: 'Organizational chart', heading: 'Organizational Chart' },
    { standard: '1.A', topic: 'Mission, vision, and values', heading: 'Mission, Vision, and Values' },
    { standard: '1.A', topic: 'Leadership communication', heading: 'Leadership Communication' },
    { standard: '1.A', topic: 'Leadership guidance on service delivery', heading: 'Guidance on Service Delivery' },
    { standard: '1.A', topic: 'Emergency succession of the chief executive', heading: 'Emergency Succession of the Chief Executive' },
  ],
  consultantNotes: 'Confirm the actual chain of command and attach the current organizational chart as an exhibit. Verify the named first and second successors for the chief executive match how the agency really operates, and that any board-approved succession plan (if the agency has a board) is consistent with this policy. The 30-day and 90-day thresholds for interim leadership are suggested defaults; adjust to bylaws or ownership agreements. Confirm leadership meeting frequency (monthly suggested) and the all-personnel communication cadence.',
  body: `
## Purpose

This policy describes how {{agency.name}} is led: who holds authority, how that authority is organized and communicated, how leaders keep services tied to the mission, and how leadership continues without interruption if the chief executive is suddenly unavailable.

## Scope

This policy applies to all leadership positions, all programs and locations, and all personnel of {{agency.name}}{{#if agency.hasBoard}}, and describes the relationship between leadership and the {{agency.governingBody}}{{/if}}.

## Policy

{{agency.name}} maintains a defined leadership structure with clear lines of authority and accountability. Leaders model the agency's mission and values, set direction for services, communicate openly with personnel and persons served, and remain accountable for the quality, safety, and integrity of every program.

## Procedures

### Leadership Structure

{{#if agency.hasBoard}}
The {{agency.governingBody}} holds ultimate authority for {{agency.name}}. It sets policy direction, approves the strategic plan and budget, and delegates day-to-day management to the {{roles.executive.title}}, who reports to the {{agency.governingBody}}.
{{else}}
The {{roles.executive.title}} holds overall operational authority for {{agency.name}} and is accountable to the agency's ownership for its performance, compliance, and finances.
{{/if}}

The {{roles.executive.title}} leads a leadership team that includes, at a minimum, the following positions or the persons assigned those duties:

- {{roles.clinical.title}}: clinical and service quality, supervision of direct service personnel, and program design.
- {{roles.finance.title}}: budgeting, accounting, billing, and fiscal controls.
- {{roles.hr.title}}: workforce planning, recruitment, credentialing, and personnel policies.
- {{roles.compliance.title}}: corporate compliance, legal and regulatory monitoring.
- {{roles.quality.title}}: performance measurement, outcomes, and accreditation readiness.
- {{roles.safety.title}}: health, safety, and emergency preparedness.

One person may hold more than one of these roles. When that happens, the assignment is documented in the person's job description and on the organizational chart.

### Organizational Chart

The {{roles.hr.title}} maintains a current organizational chart that shows every position, reporting relationships, and the program or location each position serves{{#if multipleLocations}}, including the leadership contact for each location{{/if}}. The chart is updated within 30 days of any change in structure, is reviewed by the leadership team {{admin.reviewFrequency}}, and is made available to all personnel in orientation and on request.

### Mission, Vision, and Values

The mission of {{agency.name}} is: {{agency.mission}}

{{#if agency.vision}}
Our vision is: {{agency.vision}}
{{/if}}

{{#if agency.values}}
Our core values are {{list agency.values}}.
{{/if}}

Leadership uses the mission{{#if agency.vision}}, vision,{{/if}} and values as the standard for decisions about new services, resource allocation, hiring, and performance. The mission is posted at each location, included in orientation for personnel{{#if agency.hasBoard}} and new members of the {{agency.governingBody}}{{/if}}, shared with persons served, and reviewed by leadership {{admin.reviewFrequency}} as part of strategic planning.

### Leadership Communication

Leadership communicates through regular, two-way channels:

- Leadership team meetings at least monthly, with minutes that record decisions and assigned follow-up.
- Program or team meetings led by supervisors, where leadership updates are shared and questions are carried back to leadership.
- Written updates to all personnel at least quarterly covering performance, changes in policy, and progress on the strategic plan.
- Open-door access to the {{roles.executive.title}} and leadership team for any personnel member, person served, or stakeholder.
{{#if agency.hasBoard}}
- A written report from the {{roles.executive.title}} to the {{agency.governingBody}} at each regular meeting.
{{/if}}

### Guidance on Service Delivery

Leadership sets the expectations that guide how services are delivered. Specifically, leadership:

1. Approves the scope of each program, the populations served ({{list program.populationLabels}}), and the settings in which services are provided.
2. Ensures services reflect person-centered planning, informed choice, and respect for the rights of persons served.
3. Reviews performance and outcome data at least quarterly and directs improvement where results fall short.
4. Ensures personnel have the training, supervision, and resources needed to deliver services safely and competently.
5. Reviews incidents, complaints, and grievances for patterns that require a change in practice.

### Emergency Succession of the Chief Executive

If the {{roles.executive.title}} is unexpectedly unavailable because of illness, injury, death, resignation, or other emergency, authority passes immediately to the {{roles.clinical.title}} as acting chief executive. If the {{roles.clinical.title}} is also unavailable, authority passes to the {{roles.finance.title}}.

1. The acting chief executive notifies {{#if agency.hasBoard}}the chair of the {{agency.governingBody}}{{else}}the agency's ownership{{/if}}, the leadership team, and personnel within one business day.
2. The acting chief executive has authority to make operational, personnel, and financial decisions needed to keep services running, but defers long-term commitments and policy changes unless required by an emergency.
3. Banking signatures, system access, and key contacts are kept current so that the acting chief executive can act without delay.
4. If the absence is expected to exceed 30 days, {{#if agency.hasBoard}}the {{agency.governingBody}}{{else}}ownership{{/if}} formally appoints an interim chief executive. If the absence is expected to exceed 90 days or is permanent, {{#if agency.hasBoard}}the {{agency.governingBody}}{{else}}ownership{{/if}} begins a search for a permanent replacement.
5. Funders, the state licensing agency ({{compliance.licensingAgency}}), and other parties are notified of the leadership change when contracts or regulations require it.

The {{roles.executive.title}} reviews this succession plan {{admin.reviewFrequency}} and keeps a written summary of critical responsibilities, passwords held in secure custody, and key relationships available to the acting chief executive.

## Responsibilities

- {{roles.executive.title}}: leads the agency, maintains the leadership structure, and keeps the succession plan current.
- {{roles.hr.title}}: maintains the organizational chart and job descriptions.
- Leadership team: models the mission and values and communicates with personnel.
{{#if agency.hasBoard}}
- {{agency.governingBody}}: oversees the {{roles.executive.title}} and acts on emergency succession.
{{/if}}

## Related Documents

- Organizational chart
- Job descriptions for leadership positions
- Strategic plan
{{#if agency.hasBoard}}
- Bylaws of the {{agency.governingBody}}
{{/if}}
`,
};
