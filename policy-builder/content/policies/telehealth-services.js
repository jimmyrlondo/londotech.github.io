export default {
  id: 'telehealth-services',
  number: '2.11',
  section: 'PROGRAM',
  standard: '2.A',
  topic: 'Program/Service Structure: Telehealth',
  title: 'Telehealth Services',
  manuals: ['BH', 'CYS', 'OTP', 'AS', 'ECS'],
  appliesIf: 'program.telehealth',
  standardsYear: 2026,
  crosswalk: [
    { standard: '2.A', topic: 'Clinical appropriateness of telehealth', heading: 'Clinical Appropriateness' },
    { standard: '2.A', topic: 'Informed consent for telehealth', heading: 'Informed Consent' },
    { standard: '2.A', topic: 'Identity, location, and emergency plan', heading: 'At Each Session' },
    { standard: '2.A', topic: 'Privacy and platform security', heading: 'Privacy and Technology' },
    { standard: '2.A', topic: 'Technology failures', heading: 'Technology Failures' },
    { standard: '2.A', topic: 'Licensure and documentation', heading: 'Licensure and Documentation' },
  ],
  consultantNotes: 'Standard letters follow the BH Section 2 numbering; CARF telehealth expectations appear in Section 2 program standards and in the Information and Communication Technologies standards (Section 1), with letters that differ by manual and year. Confirm the platform signs a BAA (if HIPAA applies) and meets state telehealth rules. Licensure rules for out-of-state clients, interstate compacts (PSYPACT, Counseling Compact, Social Work Compact), and Medicaid telehealth billing rules (modifiers, audio-only allowances) vary by state and payer. OTP and controlled-substance prescribing via telehealth is governed by DEA telemedicine rules, which have been extended repeatedly; verify current status before relying on them.',
  body: `
## Purpose

To ensure that services {{agency.name}} delivers through telehealth are clinically appropriate, private, secure, and as safe and effective as in-person services.

## Scope

This policy applies to all services delivered by real-time video or audio-only connection between personnel and persons served, and to all personnel who deliver them.

## Policy

Telehealth is a choice offered to persons served when it is appropriate for their needs, not a requirement. Telehealth services meet the same standards of quality, documentation, and confidentiality as in-person services, and persons served may request in-person services at any time when the program offers them.

## Procedures

### Clinical Appropriateness

Before telehealth begins, and at each plan review, the responsible professional considers whether telehealth fits the person's needs, including their clinical condition, risk level, cognitive and communication abilities, access to a private space and reliable technology, and their preference. Telehealth may not be appropriate when the person is at high risk of harm, needs hands-on assessment, or cannot participate safely or privately. The decision is documented, and the person is offered in-person options when telehealth is not appropriate.

### Informed Consent

Before the first telehealth session, personnel explain and document the person's informed consent to telehealth, covering:

- How telehealth works and how it differs from in-person services
- Potential benefits and risks, including technology failure and privacy risks
- Security measures in place and steps the person can take to protect privacy
- The emergency plan and what happens if the connection is lost
- The right to refuse telehealth or return to in-person services
- Any differences in billing or fees

{{#if program.servesMinors}}For a minor, consent is obtained from the parent or guardian unless the minor may lawfully consent on their own, and personnel agree with the family on whether an adult will be present nearby during sessions.

{{/if}}### At Each Session

At the start of every session, personnel:

1. Verify the identity of the person served (by sight for established persons, or with identifying information for new persons).
2. Confirm the person's physical location, including the street address, and record it.
3. Confirm a phone number to call if the connection drops.
4. Confirm the person is in a private space, or ask who else is present and whether the person agrees to their presence.
5. Confirm the emergency plan.

### Emergency Plan

For each person served by telehealth, the record contains an emergency plan with the person's usual location, an emergency contact, and the local emergency and crisis numbers for that area. If a person appears to be in imminent danger during a session, personnel keep the person connected when possible, call 911 or the local emergency service for the person's confirmed location, notify the emergency contact as appropriate, and notify their supervisor. The event is documented and reported under the incident policy.

### Privacy and Technology

Telehealth is delivered using {{ops.telehealthPlatform || "an agency-approved secure telehealth platform"}}{{#if compliance.hipaa}}, under a business associate agreement,{{/if}} with encryption in transit. Personnel do not use personal consumer apps or personal accounts. Personnel conduct sessions from a private, quiet space where they cannot be overheard, use headphones when others are nearby, and do not record sessions without written consent. Agency devices used for telehealth are encrypted and screen-locked.

### Technology Failures

If the video connection fails, personnel attempt to reconnect for up to 5 minutes and then call the person at the confirmed phone number to continue by phone (where clinically appropriate and permitted by the payer) or to reschedule. Persons served receive written instructions for joining sessions and for what to do if the connection fails. Repeated technology problems are reported to the {{roles.it.title}} and reviewed in deciding whether telehealth remains appropriate.

### Licensure and Documentation

Personnel deliver telehealth only to persons located in a state where the personnel are licensed or otherwise legally authorized to practice at the time of the session. The person's location is confirmed at every session for this reason. Services to persons located outside {{agency.state || "the agency's home state"}} require advance approval from the {{roles.clinical.title}}.

Each telehealth progress note documents the modality (video or audio-only), the location of the person served and of the staff member, the people present, the identity verification, and any technology problems, in addition to all standard progress note content.

## Responsibilities

The {{roles.clinical.title}} oversees telehealth appropriateness and practice. The {{roles.it.title}} maintains the platform and device security. Personnel follow this policy at every session.
`,
};
