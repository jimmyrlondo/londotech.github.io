export default {
  id: 'intensive-family-based',
  number: '3.30',
  section: 'SPECIFIC',
  standard: 'CYS 3',
  topic: 'Intensive Family-Based Services',
  title: 'Intensive Family-Based Services',
  manuals: ['CYS'],
  appliesIf: 'program.cysPrograms contains "intensiveFamily"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'CYS 3', topic: 'Intensive family-based services: family as the unit of service', heading: 'Family as the Unit of Service' },
    { standard: 'CYS 3', topic: 'Intensive family-based services: intensity and duration', heading: 'Intensity and Duration' },
    { standard: 'CYS 3', topic: 'Intensive family-based services: crisis availability', heading: 'Crisis Availability' },
    { standard: 'CYS 3', topic: 'Intensive family-based services: safety planning', heading: 'Safety Planning' },
    { standard: 'CYS 3', topic: 'Intensive family-based services: preventing out-of-home placement', heading: 'Preventing Out-of-Home Placement' },
    { standard: 'CYS 3', topic: 'Intensive family-based services: transition', heading: 'Step-Down and Transition' },
  ],
  consultantNotes: 'CARF CYS program-specific standard letters change between manual years; "CYS 3" is a placeholder for the Intensive Family-Based Services program description in the current CYS manual. Verify the section letter. Frequencies to confirm against payer and state rules: first contact within 48 hours of referral, first home session within 72 hours, 3 to 10 hours of face-to-face service per week, a 4 to 6 month episode, a written safety plan within 7 days, 24/7 on-call with a 1-hour callback, caseloads of 4 to 8 families per clinician. Many states define these services under specific Medicaid models (for example IHBT, MST, FFT, or Ohio\'s Intensive Home-Based Treatment rule) with their own fidelity, credential, and caseload requirements; if the agency runs an evidence-based model, add its fidelity requirements here. Assessment, planning, discharge, and mandated reporting are covered in Sections 1 and 2 and are only referenced.',
  body: `
## Purpose

To describe how {{agency.name}} delivers intensive family-based services: short-term, high-intensity, home-based services that strengthen the family's ability to keep a child or youth safely at home and in the community.

## Scope

This policy applies to the intensive family-based program of {{agency.name}}, to the children, youth, and families it serves, and to the personnel assigned to it. It adds program-specific requirements to the general policies on assessment (see Policy 2.03 Assessment of Persons Served), person-centered planning (see Policy 2.04 Person-Centered Planning), and transition and discharge (see Policy 2.05 Transition and Discharge).

## Policy

{{agency.name}} serves the whole family, in the family's home and community, with enough intensity to make a real difference in a short period. Services build on family strengths, respect the family's culture and values, and aim to prevent out-of-home placement whenever that can be done safely.

## Procedures

### Family as the Unit of Service

The family, as the family defines itself, is the unit of service. With consent, the clinician engages parents or caregivers, the identified child or youth, siblings, and other people the family names as important, such as grandparents, kin, or faith community members. The assessment and the person-centered plan are written with the family, describe goals for the family as well as for the child, and identify the family's strengths, natural supports, and the stressors that put the placement at risk.

### Intensity and Duration

Services are delivered mostly in the home and community at times that fit the family's schedule, including evenings and weekends.

- The program contacts the family within 48 hours of referral and holds the first home session within 72 hours.
- Each family receives 3 to 10 hours of face-to-face service per week, adjusted to need and documented in the plan.
- An episode of care typically lasts 4 to 6 months. Extending beyond 6 months requires a documented review by the {{roles.clinical.title}}.
- Clinician caseloads are kept small (typically 4 to 8 families) so that intensity can be maintained.

Services combine family therapy, parent skill-building, individual work with the child or youth, crisis support, and linkage to school, health, and community resources.

### Crisis Availability

Families have access to a member of the program team 24 hours a day, 7 days a week. At admission, each family receives the on-call number and written guidance on when to use it and when to call 911. On-call personnel return calls within 1 hour, help the family de-escalate by phone, and go to the home or arrange a mobile crisis response when needed. Every after-hours contact is documented and reviewed with the primary clinician the next business day.

### Safety Planning

Within 7 days of admission, the clinician and family complete a written safety plan that names warning signs, coping steps, people to call, and how to make the home safer (for example, securing medications, firearms, and other means of self-harm). The plan is updated after every crisis, any change in risk, and at each plan review. When a clinician suspects abuse or neglect, the clinician follows Policy 1.21 Abuse, Neglect, and Exploitation and reports to {{compliance.cpsAgency || "the county public children services agency"}}; the report does not end services.

### Preventing Out-of-Home Placement

When a child is at imminent risk of placement in foster care, residential treatment, a psychiatric hospital, or juvenile detention, the team increases contact, convenes a family team meeting with the family's consent, and coordinates with the child's school, caseworker, probation officer, and other systems involved. If placement still becomes necessary for safety, the program stays involved, supports visits and contact, and plans with the family for the child's return home.

### Step-Down and Transition

Transition planning begins at admission. As goals are met, contact is reduced in planned steps and the family is linked to ongoing outpatient services and natural supports. The program follows up with the family within 30 days after discharge.

## Responsibilities

The {{roles.clinical.title}} supervises the program, approves extended episodes, and reviews placement-risk cases weekly. Clinicians deliver services, maintain safety plans, and share on-call coverage. The {{roles.quality.title}} tracks placement prevention and family outcome measures.
`,
};
