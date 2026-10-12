export default {
  id: 'assessment',
  number: '2.03',
  section: 'PROGRAM',
  standard: '2.B',
  topic: 'Screening and Access to Services: Assessment',
  title: 'Assessment of Persons Served',
  manuals: ['BH', 'ECS', 'AS', 'CYS', 'OTP'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '2.B', topic: 'Initial assessment content', heading: 'Initial Assessment' },
    { standard: '2.B', topic: 'Strengths, needs, abilities, and preferences', heading: 'Strengths, Needs, Abilities, and Preferences' },
    { standard: '2.B', topic: 'Interpretive summary', heading: 'Interpretive Summary' },
    { standard: '2.B', topic: 'Reassessment', heading: 'Reassessment' },
    { standard: '2.B', topic: 'Qualified personnel', heading: 'Qualified Personnel' },
    { standard: '2.B', topic: 'Substance use assessment', heading: 'Substance Use Assessment', showIf: 'program.sud' },
    { standard: '2.B', topic: 'Assessment of children and adolescents', heading: 'Children and Adolescents', showIf: 'program.servesMinors' },
    { standard: '2.B', topic: 'Collateral information', heading: 'Use of Collateral Information' },
  ],
  consultantNotes: 'Standard letters follow the BH Section 2 numbering; assessment content is in 2.B in BH and may be lettered differently in ECS, AS, CYS, and OTP. The 30-day initial assessment timeframe and annual reassessment are suggested defaults: confirm against state licensing rules, payer requirements, and the program description (for example, residential or OTP programs often require completion within days, and OTP federal rules require a medical exam and assessment on admission). ECS programs often use a vocational or community assessment instead of a clinical one; adjust the content list for each program. Confirm which credential levels the state permits to complete diagnostic assessments.',
  body: `
## Purpose

To ensure every person served at {{agency.name}} receives a thorough, individualized assessment that identifies their strengths, needs, abilities, and preferences and provides the foundation for a person-centered plan.

## Scope

This policy applies to all programs of {{agency.name}} and to personnel who conduct, review, or update assessments.

## Policy

Each person admitted to a program receives an initial assessment, completed by qualified personnel within the timeframe set in this policy, that is gathered with the person served and summarized in an interpretive summary. Assessments are updated as the person's needs change and at least annually.

## Initial Assessment

The initial assessment is completed within 30 calendar days of admission, or sooner when the program description, payer, or state rules require it. Information is gathered in conversation with the person served, in a setting and manner comfortable to them. The assessment addresses, as relevant to the program:

- The reason for seeking services, in the person's own words
- Current and past services, and what has and has not helped
- Physical health, medications, allergies, and current health care providers
- Mental health and emotional well-being, including any history of trauma
- Risk factors, including risk of harm to self or others, and protective factors
- Use of alcohol, tobacco, and other substances
- Cultural background, spiritual beliefs, language, and communication needs
- Family, relationships, and natural supports
- Education, employment history, and vocational interests
- Housing, finances, transportation, and legal involvement
- Daily living skills, independence, and accommodations needed
- Any guardianship, representative payee, or legal status

{{#if program.sud}}### Substance Use Assessment

For persons with a substance use concern, the assessment also includes a substance use history (substances used, age of first use, pattern, frequency, route, and date of last use), withdrawal history and current withdrawal risk, prior treatment episodes, overdose history, and readiness for change. Level of care is determined using a recognized placement framework such as the ASAM Criteria. Personnel offer naloxone education and information about overdose risk.

{{/if}}{{#if program.servesMinors}}### Children and Adolescents

For a child or adolescent, the assessment also addresses developmental history, school functioning and educational supports, family and caregiver functioning, custody status, involvement with child protective or juvenile justice systems, and the youth's own view of their needs and goals, gathered in an age-appropriate way. Parents or guardians participate unless the youth may lawfully consent on their own.

{{/if}}## Strengths, Needs, Abilities, and Preferences

Every assessment identifies the person's strengths, needs, abilities, and preferences. Personnel ask directly what the person does well, what matters to them, how they like to receive services, and what they want to change. These are recorded in the person's own words where possible and carried forward into the person-centered plan.

## Interpretive Summary

Qualified personnel write an interpretive summary that pulls the assessment together into a clinical or professional understanding of the person served. The summary:

- Integrates the information gathered and explains how the pieces relate to each other
- Identifies the primary needs to be addressed and any co-occurring conditions
- Describes how the person's strengths can be used toward their goals
- Notes barriers, risks, and any needs the program cannot meet, with recommended referrals
- Recommends services, level of care, and frequency

The interpretive summary is shared with the person served and used to develop the person-centered plan.

## Reassessment

The assessment is updated at least annually, and sooner when the person's situation, risk level, diagnosis, or goals change significantly, when services are not producing expected progress, before a change in level of care, or when the person served requests it. Reassessment findings are reflected in an updated plan.

## Qualified Personnel

Assessments are conducted by personnel whose education, training, licensure, and experience qualify them for the type of assessment performed, as defined in each program description and in state rules. Diagnostic assessments are completed or signed by a licensed professional acting within their scope of practice. Unlicensed personnel who gather assessment information are supervised, and their work is reviewed and co-signed when required.

## Use of Collateral Information

With the consent of the person served (or guardian), personnel may gather information from family members, prior providers, schools, physicians, employers, and other sources. Collateral information is identified by source and date in the record. Prior assessments may be used when they are recent and accurate, and are reviewed and updated with the person rather than simply copied forward.

## Procedures

1. Personnel schedule the initial assessment at admission and complete it within 30 calendar days.
2. Personnel obtain any authorizations needed for collateral contacts.
3. The assessor writes the interpretive summary and reviews it with the person served.
4. The supervisor reviews and co-signs assessments when required.
5. Reassessments are completed at least annually and whenever a triggering change occurs.

## Responsibilities

The {{roles.clinical.title}} defines assessment tools and qualifications for each program. Assigned personnel complete assessments on time. Supervisors review quality as part of the records review process.
`,
};
