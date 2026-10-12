export default {
  id: 'early-childhood-development',
  number: '3.32',
  section: 'SPECIFIC',
  standard: 'CYS 3',
  topic: 'Early Childhood Development',
  title: 'Early Childhood Development Services',
  manuals: ['CYS'],
  appliesIf: 'program.cysPrograms contains "earlyChildhood"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'CYS 3', topic: 'Early childhood: developmental screening', heading: 'Developmental Screening' },
    { standard: 'CYS 3', topic: 'Early childhood: family-centered services', heading: 'Family-Centered Services' },
    { standard: 'CYS 3', topic: 'Early childhood: natural environments', heading: 'Natural Environments' },
    { standard: 'CYS 3', topic: 'Early childhood: IFSP coordination with Part C early intervention', heading: 'Coordination with Early Intervention' },
    { standard: 'CYS 3', topic: 'Early childhood: transition at age three', heading: 'Transition at Age Three' },
  ],
  consultantNotes: 'CARF CYS program-specific standard letters change between manual years; "CYS 3" is a placeholder for the Early Childhood Development program description. Verify. IDEA Part C (34 CFR Part 303) timelines to confirm: referral to the Part C system within 7 days of identifying a suspected delay (federal rule says as soon as possible, but in no case more than 7 days); evaluation, assessment, and the initial IFSP meeting within 45 days of referral; IFSP review at least every 6 months and a full annual meeting; transition planning steps and a transition plan no earlier than 9 months and no later than 90 days before the third birthday, with LEA notification at least 90 days before. Each state names its Part C lead agency differently (in Ohio, Help Me Grow Early Intervention under the Department of Children and Youth); fill in the name. Screening tools named (ASQ-3, ASQ:SE-2) are examples; confirm the tools and intervals the agency actually uses, and whether the agency is itself a Part C provider (in which case IFSP service delivery rules apply directly). Many states require mental health consultation or infant mental health endorsement credentials for this work.',
  body: `
## Purpose

To describe how {{agency.name}} supports the healthy development of infants, toddlers, and young children through developmental screening, family-centered services, and close coordination with early intervention and early education systems.

## Scope

This policy applies to the early childhood development program of {{agency.name}}, to children from birth to school entry and their families, and to the personnel who serve them. Assessment, person-centered planning, records, and consent follow the general policies in Sections 1 and 2; this policy adds what is specific to early childhood.

## Policy

{{agency.name}} recognizes that young children develop within relationships, and that parents and caregivers are the most important people in a child's life. Services are family-centered, strengths-based, culturally responsive, and delivered wherever possible in the places the child already lives, learns, and plays.

## Procedures

### Developmental Screening

Every child entering the program receives a developmental screening using a standardized, validated tool (for example, the Ages and Stages Questionnaires for general development and for social-emotional development), completed with the parent or caregiver. Screening is repeated at the intervals the tool recommends, at least every 6 months for children under 3, and whenever a parent, caregiver, or provider raises a concern. Results are reviewed with the family in plain language the same day or at the next visit. A screening result that suggests a possible delay leads to a referral for a full evaluation, with the family's consent, and is never treated as a diagnosis.

### Family-Centered Services

The family helps decide what services look like, when they happen, and what goals matter most. Personnel coach parents and caregivers in everyday routines, such as feeding, bathing, play, and bedtime, so that learning continues between visits. Services consider the needs of the whole family, including parental stress, depression, housing, food security, and safety, and the program links families to resources for these needs. Information is offered in the family's preferred language, with an interpreter when needed.

### Natural Environments

Services are delivered in the child's natural environments, such as the home, child care setting, or community settings where children of the same age without delays participate. When a service is provided somewhere else, the reason is documented along with a plan to move it into a natural setting.

### Coordination with Early Intervention

When a child from birth to age 3 may have a developmental delay or disability, the program refers the child to the state Part C early intervention system{{#if compliance.partCLeadAgency}} ({{compliance.partCLeadAgency}}){{/if}} within 7 days of identifying the concern, with the parent's consent. If the child is found eligible, the program, with written consent, participates in developing the Individualized Family Service Plan (IFSP) and aligns its own plan with the IFSP outcomes so the family has one coordinated set of goals. The program shares progress with the family's service coordinator, attends IFSP reviews when invited, and avoids duplicating services the IFSP already provides.

### Transition at Age Three

Planning for the transition out of Part C services begins at least 6 months before the child's third birthday. With the family's consent, the program works with the service coordinator and the local school district to support the family through the referral for preschool special education, eligibility evaluation, and the Individualized Education Program (IEP) meeting, and helps the family explore other options such as Head Start, community preschool, or child care. The program shares records only with written authorization and continues to support the family through the change.

## Responsibilities

The {{roles.clinical.title}} oversees screening practice, referral timeliness, and coordination with early intervention. Program personnel complete screenings, coach families, and document coordination activities. The {{roles.quality.title}} monitors the timeliness of referrals and transitions.
`,
};
