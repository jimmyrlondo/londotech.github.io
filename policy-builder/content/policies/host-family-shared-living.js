export default {
  id: 'host-family-shared-living',
  number: '3.15',
  section: 'SPECIFIC',
  standard: 'ECS 3',
  topic: 'Host Family/Shared Living',
  title: 'Host Family and Shared Living',
  manuals: ['ECS'],
  appliesIf: 'program.ecsPrograms contains "hostFamily"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'ECS 3', topic: 'Host Family/Shared Living: program description', heading: 'Program Description' },
    { standard: 'ECS 3', topic: 'Host Family/Shared Living: recruitment and screening of host providers', heading: 'Recruiting and Screening Host Families' },
    { standard: 'ECS 3', topic: 'Host Family/Shared Living: home study', heading: 'Home Study' },
    { standard: 'ECS 3', topic: 'Host Family/Shared Living: matching and choice', heading: 'Matching' },
    { standard: 'ECS 3', topic: 'Host Family/Shared Living: written agreement with host family', heading: 'Host Family Agreement' },
    { standard: 'ECS 3', topic: 'Host Family/Shared Living: monitoring and oversight', heading: 'Monitoring Visits' },
    { standard: 'ECS 3', topic: 'Host Family/Shared Living: respite and support for host families', heading: 'Support and Respite for Host Families' },
    { standard: 'ECS 3', topic: 'Host Family/Shared Living: transition', heading: 'Transition and Discharge' },
    { standard: 'ECS 3', topic: 'Host Family/Shared Living: outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Section reference is a best estimate: Host Family/Shared Living appears among the community services standards in Section 3 of the ECS manual; verify the letter against the current manual. Host homes are usually provider-controlled settings under the HCBS settings rule (42 CFR 441.301(c)(4)), so confirm the state approach to leases or residency agreements in host homes. Suggested defaults: background checks on every household member age 18 and older, home study renewed annually, monthly monitoring visits (at least one unannounced each quarter), 30 days notice to end the agreement, and an annual respite allotment set in the agreement. For Ohio DD shared living, confirm OAC 5123-9 shared living rules, whether host providers are agency employees or contractors, and county board requirements. If the agency treats hosts as independent contractors, have employment counsel review the classification.',
  body: `
## Purpose

To describe how {{agency.name}} recruits, approves, matches, and supports host families who share their home and daily life with a person served.

## Scope

This policy applies to host family and shared living services, to host providers, and to the personnel who recruit, train, and monitor them. Assessment, planning, rights, and discharge are covered in Policy 2.03 Assessment of Persons Served, Policy 2.04 Person-Centered Planning, Policy 1.19 Rights of Persons Served, and Policy 2.05 Transition and Discharge. This policy adds what is specific to host family and shared living.

## Program Description

In host family and shared living, a person served lives in the home of an approved individual or family who provides support as part of everyday household life. The arrangement offers a family setting, stable relationships, and a place in the neighborhood. {{#if program.populations contains "idd"}}Most persons served in this program have developmental disabilities, and supports follow the individual service plan authorized by the funding source. {{/if}}Program staff are available {{program.hours || "during regular business hours"}}, and an on-call supervisor is available to host families at all times.

{{#if program.payers}}Host family services are funded through {{list program.payers}}. Room and board are paid by the person served under a separate written agreement.

{{/if}}## Recruiting and Screening Host Families

Host families are recruited through community outreach and referrals. Each applicant:

- Completes a written application and an interview
- Provides personal references
- Has a criminal background check and abuse registry check, as does every other household member age 18 and older
- Shows a valid driver's license and insurance if they will drive persons served
- Completes orientation and training on rights, abuse reporting, the person's plan, emergency procedures, and documentation{{#if ops.medsAny}}, plus any medication training required by Policy 2.06 Medication Management{{/if}}

## Home Study

A qualified staff member completes a home study before approval and updates it at least annually. The home study covers the household's members and routines, motivation, the physical safety and accessibility of the home, a private bedroom for the person served, fire safety and evacuation, and the family's ability to meet the needs of the person served. The {{roles.clinical.title}} approves each home.

## Matching

The person served leads the match. They meet potential host families, visit the home, and have overnight or trial visits before deciding. The family also chooses freely. The match is based on shared interests, routines, culture, location near the person's community and relationships, and the family's ability to provide the supports in the plan. No one is placed in a home they have not chosen.

## Host Family Agreement

Before the person moves in, the host family, the person served (or guardian), and {{agency.name}} sign a written agreement that states:

- The supports the host family provides and how they document them
- Payment terms and room-and-board arrangements
- The person's rights in the home, including privacy, visitors, and personal belongings
- Respite arrangements
- Reporting duties for incidents, abuse, and changes in health
- How either party can end the arrangement, with at least 30 days' notice except in an emergency

## Monitoring Visits

Program staff visit each home at least monthly, and at least one visit each quarter is unannounced. Staff meet privately with the person served at every visit, review documentation, check the home for safety, and talk with the host family about how things are going. Concerns are addressed through a written plan with timelines. Abuse or neglect concerns are reported right away under Policy 1.21 Abuse, Neglect, and Exploitation.

## Support and Respite for Host Families

Host families receive ongoing training, a named contact at {{agency.name}}, and on-call help. Each agreement includes planned respite so host families can rest, and respite providers meet the same screening requirements as host families. Host families are invited to give feedback on the program at least annually.

## Transition and Discharge

When a match ends, by anyone's choice, program staff help the person find a new home they choose and plan a gradual move whenever possible. The person's belongings and records go with them. Transitions follow Policy 2.05 Transition and Discharge.

## Outcomes Measured

At least quarterly, the program measures stability of matches, satisfaction of persons served and host families, progress toward plan goals, and incidents. Results are reported to the {{roles.quality.title}}.

## Responsibilities

- {{roles.clinical.title}}: approves host homes and oversees the program.
- Host family coordinators: recruit, train, match, and monitor host families.
- Host families: provide and document supports under the agreement.
`,
};
