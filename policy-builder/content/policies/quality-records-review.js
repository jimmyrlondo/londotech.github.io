export default {
  id: 'quality-records-review',
  number: '2.09',
  section: 'PROGRAM',
  standard: '2.H',
  topic: 'Quality Records Management',
  title: 'Quality Records Review',
  manuals: ['BH', 'ECS', 'AS', 'CYS', 'OTP'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '2.H', topic: 'Quarterly professional review', heading: 'Frequency and Sample' },
    { standard: '2.H', topic: 'Qualified reviewers', heading: 'Reviewers' },
    { standard: '2.H', topic: 'Review content and tool', heading: 'What Is Reviewed' },
    { standard: '2.H', topic: 'Reporting results', heading: 'Reporting Results' },
    { standard: '2.H', topic: 'Corrective action and performance improvement', heading: 'Corrective Action and Performance Improvement' },
  ],
  consultantNotes: 'Standard letters follow the BH Section 2 numbering; letter assignments differ by manual and year. CARF expects a quarterly professional review of current and closed records by qualified personnel; confirm current wording and whether the program must also review records for appropriateness of services (utilization review). The sample size (10 percent or at least 5 records per program per quarter, whichever is greater) and the 90 percent compliance threshold are suggested defaults; small programs may need to review all records. Surveyors will ask to see completed review tools, quarterly summaries, and evidence that findings led to action.',
  body: `
## Purpose

To ensure that records of persons served at {{agency.name}} are complete, accurate, and timely, and that the services they document are appropriate and effective, through regular professional review.

## Scope

This policy applies to the records of persons served in every program of {{agency.name}}, including current and closed records.

## Policy

{{agency.name}} conducts a professional review of a representative sample of current and closed records at least quarterly. Reviews are done by qualified personnel, use a standard review tool, and lead to documented corrective action and ongoing improvement.

## Procedures

### Frequency and Sample

Each quarter, the {{roles.quality.title}} selects a representative sample of records from each program, including both open and recently closed records. The sample is at least 10 percent of records active during the quarter or 5 records per program, whichever is greater. Records are selected at random, with additional records added when needed so that the sample covers different programs, {{#if multipleLocations}}locations, {{/if}}staff members, and populations served. A reviewer may also select records related to a complaint, incident, or concern.

### Reviewers

Reviews are completed by personnel who are qualified by education, training, and experience to judge the quality of the services documented, such as licensed clinicians, supervisors, or experienced program leaders. Reviewers do not review records in which they are the primary author. Reviewers are trained on the review tool, and the {{roles.quality.title}} checks consistency between reviewers at least annually.

### What Is Reviewed

The review tool is approved by the {{roles.clinical.title}} and reflects the requirements of this manual, CARF standards, state rules, and payer requirements. Reviewers check:

- Presence and completeness of required documents, such as consents, orientation, and authorizations
- Timeliness of the assessment, plan, plan reviews, progress notes, and discharge summary
- Quality of the assessment and interpretive summary
- Whether the plan reflects the assessment and the person's own goals and words
- Whether progress notes relate to plan goals and show the person's response
- Evidence of the participation of the person served throughout
- Appropriateness of the services provided and their intensity for the person's needs
- Coordination with other providers and follow-up on referrals
- Signatures, credentials, dates, legibility, and correct use of corrections
- For closed records, the transition plan, discharge summary, and follow-up

### Reporting Results

The reviewer completes the tool for each record, notes deficiencies, and gives feedback to the responsible staff member and supervisor. The {{roles.quality.title}} compiles a quarterly summary showing results by program and by item, compares them with prior quarters, and identifies any item below 90 percent compliance. The summary is reported to the {{roles.clinical.title}}, the {{roles.executive.title}}, and the performance improvement committee or leadership team{{#if agency.hasBoard}}, and key findings are included in reports to the {{agency.governingBody}}{{/if}}.

### Corrective Action and Performance Improvement

When a record has a deficiency that can be corrected, such as a missing signature or an overdue plan review, the responsible staff member corrects it within 10 business days using proper late-entry or amendment procedures, and the supervisor confirms the correction. Records are never backdated or altered to appear compliant.

When a deficiency is repeated or affects many records, the {{roles.clinical.title}} develops a corrective action plan that may include retraining, changes to forms or {{ops.ehrSystem || "electronic record"}} templates, added supervision, or workflow changes. The next quarterly review checks whether the action worked. Trends from record reviews are used in the agency's performance improvement plan and in setting documentation and service quality goals.

## Responsibilities

The {{roles.quality.title}} coordinates sampling, compiles results, and tracks corrective action. The {{roles.clinical.title}} approves the review tool and oversees corrective action. Supervisors and assigned reviewers complete reviews and support staff in making corrections.
`,
};
