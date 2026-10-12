export default {
  id: 'transition-discharge',
  number: '2.05',
  section: 'PROGRAM',
  standard: '2.D',
  topic: 'Transition/Discharge',
  title: 'Transition and Discharge',
  manuals: ['BH', 'ECS', 'AS', 'CYS', 'OTP'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '2.D', topic: 'Transition planning from admission', heading: 'Planning for Transition' },
    { standard: '2.D', topic: 'Transition plan content', heading: 'Transition Plan' },
    { standard: '2.D', topic: 'Discharge summary content', heading: 'Discharge Summary' },
    { standard: '2.D', topic: 'Involuntary discharge and appeal', heading: 'Involuntary Discharge' },
    { standard: '2.D', topic: 'Follow-up after discharge', heading: 'Follow-Up After Discharge' },
    { standard: '2.D', topic: 'Transfers between levels of care', heading: 'Transfers Between Levels of Care' },
  ],
  consultantNotes: 'Standard letters follow the BH Section 2 numbering; letter assignments differ by manual and year. Timeframes (discharge summary within 15 calendar days, 30-day written notice for involuntary discharge, 10-day appeal window, follow-up contact within 30 days) are suggested defaults: confirm against state licensing rules, Medicaid waiver rules (which often set longer notice periods and fair hearing rights), residential tenancy or landlord-tenant law for residential settings, and payer contracts. OTP programs must follow federal rules on medically supervised withdrawal and administrative discharge.',
  body: `
## Purpose

To ensure persons served at {{agency.name}} move through, between, and out of services in a planned, safe, and supported way that protects the progress they have made.

## Scope

This policy applies to all programs of {{agency.name}} and covers planned transitions, transfers between levels of care or programs, voluntary and involuntary discharge, and follow-up after discharge.

## Policy

Transition planning begins at admission and continues throughout services. Persons served participate in every transition decision. No person is discharged without a documented reason, and involuntary discharge is used only as a last resort, with advance notice and the right to appeal.

## Planning for Transition

From the first planning meeting, personnel discuss with the person served what success will look like and what will indicate that they are ready to move to a different level of service or end services. Preliminary transition criteria are recorded in the person-centered plan and revisited at every plan review.

## Transition Plan

When a transition or discharge is anticipated, personnel develop a written transition plan with the person served, and with their family or guardian when appropriate. The transition plan identifies:

- The reason for the transition and the person's own view of it
- Progress made and strengths the person is taking forward
- Ongoing needs and how they will be met
- Referrals made, including provider names, contact information, and appointment dates when known
- Medications, prescriptions, and health care follow-up, when applicable
- Natural supports and community resources the person can draw on
- Early warning signs and a plan for getting help, including crisis contacts
- How the person can return to services at {{agency.name}} if needed

The person served receives a copy of the transition plan. With the person's authorization, relevant information is shared with the receiving provider before the transition date.

## Transfers Between Levels of Care

When a person moves between programs or levels of care within {{agency.name}}, or to another provider, personnel:

1. Confirm with the person served that the transfer is consistent with their goals and choices.
2. Obtain authorization for any release of information.
3. Communicate directly with the receiving program or provider, and send current assessment, plan, and medication information.
4. Avoid gaps in service by keeping current services in place until the receiving service begins, where possible.
5. Document the transfer and the handoff in the record.

## Discharge Summary

A discharge summary is completed within 15 calendar days of discharge. It includes:

- Dates of admission and discharge
- The reason for discharge
- The services provided and the person's response to them
- Status at discharge compared with status at admission, including progress on each goal
- The person's condition and any unresolved needs or risks
- Referrals and recommendations for continuing care
- Medications at discharge, when applicable

When a person stops attending without notice, personnel make and document at least two attempts to reach them by different methods before discharge, and the discharge summary records those efforts.

## Involuntary Discharge

Involuntary discharge may occur only when the person's needs exceed what the program can safely provide, when continued service would place the person or others at serious risk, when funding or eligibility ends and no alternative is available, or when the person repeatedly and seriously violates program expectations after documented efforts to resolve the issue. Discharge is never used as punishment or retaliation for a complaint or grievance.

Before an involuntary discharge, except in an emergency where immediate safety requires it:

1. The team reviews alternatives, such as plan changes, added supports, or a change in level of care.
2. The {{roles.clinical.title}} approves the discharge.
3. The person served (and guardian) receives written notice at least 30 calendar days in advance, stating the reason, the effective date, referrals offered, and how to appeal.
4. The person may appeal within 10 calendar days to the {{roles.executive.title}}, who decides the appeal in writing. Services continue while an appeal is pending unless safety prevents it.
5. The person is also informed of the grievance process and any external appeal rights through the payer or {{compliance.licensingAgency || "the state licensing agency"}}.

## Follow-Up After Discharge

Unless the person served declines, personnel contact the person within 30 calendar days after a planned discharge to ask how they are doing, whether referrals were completed, and whether further help is needed. Results of follow-up contacts are documented and used by the {{roles.quality.title}} to measure service outcomes.

## Responsibilities

The {{roles.clinical.title}} oversees transition practices and approves involuntary discharges. Assigned staff develop transition plans, complete discharge summaries, and conduct follow-up. The {{roles.quality.title}} tracks discharge outcomes and follow-up results.
`,
};
