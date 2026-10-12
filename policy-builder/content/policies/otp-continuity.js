export default {
  id: 'otp-continuity',
  number: '3.45',
  section: 'SPECIFIC',
  standard: 'OTP 2',
  topic: 'Opioid Treatment Program',
  title: 'OTP Continuity of Care',
  manuals: ['OTP'],
  appliesIf: 'program.otpPrograms contains "otp"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'OTP 2', topic: 'OTP: guest dosing', heading: 'Guest Dosing' },
    { standard: 'OTP 2', topic: 'OTP: emergency and disaster dosing plan', heading: 'Emergency and Disaster Dosing Plan' },
    { standard: 'OTP 2', topic: 'OTP: medically supervised withdrawal and tapering', heading: 'Medically Supervised Withdrawal and Tapering' },
    { standard: 'OTP 2', topic: 'OTP: transfers', heading: 'Transfers to Another Provider' },
    { standard: 'OTP 2', topic: 'OTP: discharge without abandonment', heading: 'Discharge Without Abandonment' },
  ],
  consultantNotes: 'CARF OTP manual numbering varies by year; "OTP 2" is a placeholder. Verify. VERIFY against current 42 CFR Part 8 (2024 rule), SAMHSA guidance, DEA rules, and the SOTA: (1) guest dosing arrangements and documentation requirements are set by SAMHSA and the states involved; confirm the information that must be exchanged and any limit on guest dosing duration. (2) Disaster planning: SAMHSA and the SOTA can approve exceptions (via the SMA-168 exception request process) to take-home limits in emergencies; DEA registrants must notify the DEA before moving controlled substances to another location. Confirm the current exception process. (3) The 2024 rule requires that persons who are discharged be offered a referral and that the program not make discharge decisions based solely on drug test results; involuntary taper length here (at least 21 days for methadone unless safety requires faster) is a common practice benchmark, not federal law; set it with the medical director and state rule. (4) Persons who are pregnant generally should not be tapered involuntarily; confirm state rule. (5) Central registry must be updated at discharge or transfer per state rule.',
  body: `
## Purpose

To make sure that persons served by the opioid treatment program of {{agency.name}} continue to receive medication when they travel, when the program is disrupted by an emergency, when they choose to stop medication, when they transfer, and when they leave the program.

## Scope

This policy applies to all persons served in the OTP and to the {{roles.medical.title}}, practitioners, nurses, and counselors. General transition and discharge practices follow Policy 2.05 Transition and Discharge, and agency-wide emergency procedures follow Policy 1.13 Emergency Procedures; this policy adds what is specific to the OTP.

## Policy

Abruptly stopping medication for opioid use disorder puts a person at high risk of overdose and death. {{agency.name}} plans every change in treatment to protect continuity of medication, and never ends medication without offering a safe taper, a referral, or both.

## Procedures

### Guest Dosing

When a person served needs to travel, the program arranges guest dosing at an OTP near the destination, with the person's written consent under 42 CFR Part 2. The program sends the receiving OTP the person's identity, current dose, last dose date, take-home status, and the dates of the guest dosing period, and confirms receipt. When {{agency.name}} provides guest dosing for a person enrolled elsewhere, it obtains the same information from the home program before the first dose, verifies identity, and sends a record of doses given back to the home program.

### Emergency and Disaster Dosing Plan

The program keeps a written plan for continuing dosing when the clinic cannot operate normally because of severe weather, a utility failure, a public health emergency, or another disaster. The plan:

- Identifies a partner OTP or alternate site for dosing and how dosing records will be shared
- Keeps an up-to-date, secure, offline copy of each person's current dose and take-home status
- Describes when the {{roles.medical.title}} may approve extra take-home doses and how to request any needed exception from SAMHSA and the State Opioid Treatment Authority{{#if compliance.sota}} ({{compliance.sota}}){{/if}}
- Describes how persons served will be told about closures and where to dose, using phone, text, and posted notices
- Addresses DEA notification before medication is moved to another site

The plan is reviewed annually and tested in at least one drill per year.

### Medically Supervised Withdrawal and Tapering

A person may ask to taper off medication at any time. The practitioner discusses the risks, especially the high risk of overdose after tapering, and agrees on a gradual schedule the person can adjust or stop. Counseling support is increased during the taper, naloxone is provided, and the person is told they can return to maintenance treatment without penalty. Persons who are pregnant are counseled on the risks of tapering during pregnancy.

### Transfers to Another Provider

When a person transfers to another OTP or to an office-based buprenorphine prescriber, the program, with consent, sends the dosing history, current dose, last dose date, take-home status, and relevant clinical information before the last dose here, and confirms the first appointment so that no doses are missed. The central registry is updated as the state requires.

### Discharge Without Abandonment

Involuntary discharge is used only when the person's behavior poses a serious risk to the safety of others or the program, or when the person cannot pay and no other funding is available, and only after lesser measures have been tried. Drug test results alone are not a reason for discharge. Before involuntary discharge, the person receives:

1. A written explanation of the reason and the right to appeal under Policy 1.20 Complaints and Grievances.
2. A referral to another OTP or provider of medication for OUD, with help scheduling the first appointment.
3. A medically supervised taper of at least 21 days for methadone, unless immediate safety requires a shorter period approved by the {{roles.medical.title}}, or a bridge to continued medication with the new provider.
4. Naloxone and overdose prevention education.

Every discharge is documented, the central registry is updated as required, and the program offers follow-up contact within 30 days.

## Responsibilities

The {{roles.medical.title}} approves tapers, involuntary discharges, and disaster dosing decisions. Counselors coordinate guest dosing, transfers, and referrals. The {{roles.safety.title}} maintains the disaster dosing plan with the {{roles.medical.title}}, and the {{roles.clinical.title}} reviews every involuntary discharge.
`,
};
