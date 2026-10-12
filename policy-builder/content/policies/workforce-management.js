export default {
  id: 'workforce-management',
  number: '1.16',
  section: 'ASPIRE',
  standard: '1.I',
  topic: 'Workforce Development and Management',
  title: 'Workforce Development and Management',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.I', topic: 'Workforce planning', heading: 'Workforce Planning' },
    { standard: '1.I', topic: 'Job descriptions', heading: 'Job Descriptions' },
    { standard: '1.I', topic: 'Recruitment and retention', heading: 'Recruitment and Retention' },
    { standard: '1.I', topic: 'Verification of background, credentials, and fitness for duty', heading: 'Verification of Backgrounds and Credentials' },
    { standard: '1.I', topic: 'Orientation', heading: 'Orientation' },
    { standard: '1.I', topic: 'Ongoing training and supervision', heading: 'Ongoing Training and Supervision' },
    { standard: '1.I', topic: 'Competency-based performance evaluation', heading: 'Performance Evaluation' },
    { standard: '1.I', topic: 'Succession planning', heading: 'Succession Planning' },
    { standard: '1.I', topic: 'Personnel records', heading: 'Personnel Records' },
    { standard: '1.I', topic: 'Contract personnel', heading: 'Contracted Personnel', showIf: 'ops.contractors' },
  ],
  consultantNotes: 'Section 1.I lettering may shift between manual years; verify the crosswalk. Confirm the state background check rules (in Ohio, BCI and FBI fingerprint checks under the applicable ORC/OAC sections for DODD and OhioMHAS providers, plus database checks such as the abuser registry, sex offender registry, OIG exclusion list, and SAM). Confirm recheck frequency (often every five years, or continuous monitoring through Rapback). Confirm the OIG/SAM/state Medicaid exclusion check frequency (monthly is common). Confirm the state-required orientation topics and hours for direct support personnel, which may exceed the list here. The 90-day introductory review and 30-day orientation completion are recommended defaults.',
  body: `
## Purpose

{{agency.name}} recruits, develops, supports, and retains a qualified, competent workforce that is sufficient to deliver services consistent with its mission. This policy describes how the organization plans for, hires, orients, trains, supervises, and evaluates personnel.

## Scope

This policy applies to all employees{{#if ops.contractors}} and contracted personnel{{/if}}. Volunteers and students are addressed in their own policy where applicable.

## Policy

{{agency.name}} is an equal opportunity employer and makes employment decisions without regard to any characteristic protected by law. Every position has a current job description, every personnel member's qualifications are verified before they work with persons served, and every personnel member receives orientation, ongoing training, supervision, and an annual competency-based performance evaluation. The {{roles.hr.title}} administers this policy under the direction of the {{roles.executive.title}}.

## Procedures

### Workforce Planning

At least annually, as part of strategic and budget planning, leadership reviews workforce composition, vacancies, turnover, staffing ratios, training needs, and the diversity of the workforce compared with persons served and the community. The review identifies the staffing needed to meet current and projected service demand and the actions needed to fill gaps.

### Job Descriptions

Each position has a written job description stating essential duties, required education, experience, licensure or certification, physical requirements, and the position it reports to. Job descriptions are reviewed at least every two years and when duties change, and each personnel member receives the job description for their position.

### Recruitment and Retention

The {{roles.hr.title}} recruits through channels that reach a diverse pool of qualified applicants, including persons with lived experience where appropriate. Retention strategies are reviewed annually using turnover and exit interview data and may include competitive compensation, recognition, career ladders, flexible scheduling, and personnel satisfaction surveys.

### Verification of Backgrounds and Credentials

Before a personnel member has contact with persons served, the {{roles.hr.title}} completes and documents:

- Criminal background checks as required by state law, including fingerprint checks where required, and registry checks such as abuse and neglect registries and sex offender registries
- Exclusion list checks (federal OIG, SAM, and the state Medicaid exclusion list) at hire and monthly thereafter
- Primary source verification of any required license, certification, or degree, directly with the issuing body, with expiration dates tracked so renewals are verified before lapse
- Reference checks
- A motor vehicle record check and proof of insurance for any position that drives for agency business
- Fitness for duty, meaning the ability to perform the essential functions of the job with or without reasonable accommodation, along with any health screening required by law, such as tuberculosis screening

Background checks are repeated at the frequency required by state rule. Personnel must report any arrest, conviction, or license action within 24 hours.

### Orientation

New personnel complete orientation within 30 days of hire and before working independently with persons served. Orientation includes:

- Mission, vision, values, and organizational structure
- Rights of persons served, grievances, and abuse and neglect reporting
- Confidentiality{{#if compliance.hipaa}}, including HIPAA privacy and security{{/if}}{{#if compliance.part2}} and 42 CFR Part 2 protections{{/if}}
- Ethics, corporate compliance, and conflicts of interest
- Health and safety, emergency procedures, infection control, and critical incident reporting
- Person-centered and trauma-informed practice and cultural competency
- Personnel policies, including harassment prevention
- Job-specific duties and use of {{ops.ehrSystem || "the electronic health record"}}
{{#if ops.administersMeds}}- Medication administration, for personnel whose duties include it
{{/if}}{{#if ops.usesRestraint}}- Prevention of behavioral emergencies and the agency's emergency safety intervention model
{{/if}}
Completion is documented in the personnel record, and competency is checked by the supervisor before the personnel member works independently.

### Ongoing Training and Supervision

Personnel complete required annual training and any role-specific training identified in their evaluation or in agency analyses of incidents and performance. Each personnel member has an identified supervisor who provides regular supervision, at a frequency set by role and experience, to review performance, support professional growth, and address quality and safety. Clinical supervision meets any licensure board requirements.

### Performance Evaluation

Supervisors complete an introductory review at 90 days and a written, competency-based performance evaluation at least annually. Evaluations measure performance against the job description's essential functions, review accomplishment of prior goals, and set goals and training for the coming year. The personnel member signs the evaluation, may add comments, and receives a copy.

### Succession Planning

Leadership maintains a succession plan that identifies interim coverage and development of internal candidates for the {{roles.executive.title}} and other key positions{{#if agency.hasBoard}}. The {{agency.governingBody}} reviews the succession plan for the {{roles.executive.title}} at least annually{{/if}}.

### Personnel Records

The {{roles.hr.title}} keeps a personnel record for each personnel member containing the application, job description, verification of credentials and background checks, orientation and training records, evaluations, and disciplinary actions. Health and medical information is kept separately. Records are secured, access is limited to those with a need to know, and records are retained for at least {{compliance.retentionYears}} years after separation or as required by law.

{{#if ops.contractors}}### Contracted Personnel

Contracted personnel who provide services to persons served meet the same qualification, background check, credential verification, orientation, and training requirements as employees. Contracts state these requirements, and the {{roles.hr.title}} keeps verification on file. Contractor performance is reviewed at least annually and before contract renewal.
{{/if}}
{{#if ops.remoteWork}}### Remote Work

Personnel approved for remote work have a written remote work agreement covering schedule, availability, workspace safety, equipment, and expectations for performance and supervision. Remote personnel follow the Technology policy, use only agency-approved devices and systems, work where conversations and screens cannot be seen or overheard, and never store information about persons served on personal devices or paper at home.
{{/if}}
## Responsibilities

- The {{roles.hr.title}} administers recruitment, verification, orientation tracking, and personnel records.
- Supervisors provide supervision, training, and evaluations.
- The {{roles.executive.title}} leads workforce planning and succession planning.

## Related Documents

- Volunteers and Students
- Technology
- Personnel handbook and job descriptions
`,
};
