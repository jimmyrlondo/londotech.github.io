export default {
  id: 'vocational-evaluation',
  number: '3.22',
  section: 'SPECIFIC',
  standard: 'ECS 3',
  topic: 'Comprehensive Vocational Evaluation Services',
  title: 'Comprehensive Vocational Evaluation Services',
  manuals: ['ECS'],
  appliesIf: 'program.ecsPrograms contains "vocEval"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'ECS 3', topic: 'Vocational evaluation program description', heading: 'Program Description' },
    { standard: 'ECS 3', topic: 'Referral questions', heading: 'Referral Questions' },
    { standard: 'ECS 3', topic: 'Evaluation methods', heading: 'Evaluation Methods' },
    { standard: 'ECS 3', topic: 'Evaluator qualifications', heading: 'Staffing and Qualifications' },
    { standard: 'ECS 3', topic: 'Interpretation and written report', heading: 'Interpretation and Written Report' },
    { standard: 'ECS 3', topic: 'Evaluation outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Verify the ECS section and letter for Comprehensive Vocational Evaluation Services in the current manual; "ECS 3" is a placeholder. Timeframes (evaluation started within 10 business days of authorization, typical length of 5 to 15 days, written report within 10 business days of the last evaluation day, feedback meeting within 15 business days) are suggested defaults; the state VR agency or referring funder often sets its own report deadline, which controls. Confirm the agency holds current licenses for any standardized instruments it uses and that evaluators meet the publisher\'s qualification level. Name the specific instruments in the program description, not in this policy.',
  body: `
## Purpose

To describe how {{agency.name}} conducts comprehensive vocational evaluations that answer the questions a person served and their referral source have about work, and that produce clear, usable recommendations.

## Scope

This policy applies to the Comprehensive Vocational Evaluation program of {{agency.name}} and to every evaluator and supervisor who conducts, scores, or reports evaluations. General assessment, records, and confidentiality requirements are covered by Policy 2.03 Assessment of Persons Served, Policy 2.08 Records of the Persons Served, and Policy 2.10 Confidentiality and Release of Information.

## Program Description

The program serves {{list program.populationLabels}} who want to learn more about their vocational interests, abilities, and support needs before choosing a job or training path. Evaluations take place at agency locations and, when useful, at real community worksites. Evaluation appointments are offered {{program.hours || "during the hours listed in the program description"}}.{{#if program.payers}} Funding sources include {{list program.payers}}.{{/if}}

## Eligibility and Admission

A person is admitted with a referral and funding authorization (most often from the state vocational rehabilitation agency{{#if compliance.vrAgency}}, {{compliance.vrAgency}}{{/if}}) or by their own request with a payment arrangement. Admission follows Policy 2.02 Screening and Access to Services. Evaluation begins within 10 business days of authorization.

## Referral Questions

Before testing begins, the evaluator meets with the person served, and with the referral source when the person authorizes it, to write down the specific questions the evaluation must answer. Examples include which kinds of work fit the person's interests and abilities, what accommodations or assistive technology would help, whether training is needed, and what level of job support is likely. The person's own questions are always included. Evaluation methods are chosen to answer these questions, not from a fixed battery.

## Evaluation Methods

Evaluators use several sources of information so that no single score decides the outcome:

- Interviews with the person served and, with consent, family members and other supports
- Review of school, medical, and prior vocational records
- Situational assessments at community businesses or agency work sites, with direct observation of real tasks
- Standardized tests of interests, aptitudes, academic skills, and work behaviors, given under the publisher's conditions and with any needed accommodations
- Work samples and job tryouts related to the person's interests
- Observation of work behaviors such as stamina, attention, following directions, and social interaction

Each evaluation typically lasts 5 to 15 days, scheduled around the person's tolerance and preferences.{{#if ops.transportation}} When the person has no other way to reach a situational assessment site, {{agency.name}} may provide transportation under Policy 1.15 Transportation of Persons Served.{{/if}}{{#if program.telehealth}} Interviews and some interest inventories may be completed through telehealth under Policy 2.11 Telehealth Services; situational assessments and timed tests are completed in person.{{/if}}

## Staffing and Qualifications

Evaluations are conducted by evaluators with education and experience in vocational evaluation or a related field, and with any credential the funding source requires. Evaluators use only instruments they are qualified to give under the publisher's standards. A senior evaluator or the {{roles.clinical.title}} reviews each report before release.

## Interpretation and Written Report

The evaluator interprets results in light of the person's culture, language, disability, and life experience, and notes any limits on the validity of a test. The written report is completed within 10 business days of the last evaluation day and includes:

- The referral questions and a direct answer to each
- The methods and instruments used and the conditions of testing
- The person's interests, strengths, and preferred work conditions
- Barriers to employment and recommended accommodations or assistive technology
- Specific recommendations for jobs, training, or further services, with the supports needed for each

The evaluator reviews the findings with the person served in plain language within 15 business days of the last evaluation day, records the person's response to the recommendations, and sends the report to the referral source only with the person's authorization.

## Coordination and Transition

After the feedback meeting, personnel help the person act on the recommendations by sharing the report with providers the person chooses{{#if program.ecsPrograms contains "communityEmployment"}}, including a referral to the agency's Community Employment Services program (Policy 3.20) when the person wants it{{/if}}. The evaluation episode closes when the report is delivered and reviewed, following Policy 2.05 Transition and Discharge.

## Outcomes Measured

The program tracks time from authorization to start, time to report completion, referral source satisfaction with report usefulness, satisfaction of persons served, and the share of persons who begin a recommended service within 6 months. Results go to the {{roles.quality.title}}.

## Responsibilities

The {{roles.clinical.title}} oversees the program and evaluator qualifications. Evaluators plan, conduct, score, and report evaluations. The {{roles.quality.title}} analyzes timeliness and satisfaction data.
`,
};
