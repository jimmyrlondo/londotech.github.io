export default {
  id: 'records-of-persons-served',
  number: '2.08',
  section: 'PROGRAM',
  standard: '2.G',
  topic: 'Records of the Persons Served',
  title: 'Records of the Persons Served',
  manuals: ['BH', 'ECS', 'AS', 'CYS', 'OTP'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '2.G', topic: 'Record contents', heading: 'Record Contents' },
    { standard: '2.G', topic: 'Timeliness of documentation', heading: 'Timeliness of Documentation' },
    { standard: '2.G', topic: 'Electronic records', heading: 'Electronic Records' },
    { standard: '2.G', topic: 'Corrections and late entries', heading: 'Corrections and Late Entries' },
    { standard: '2.G', topic: 'Access by persons served', heading: 'Access by Persons Served' },
    { standard: '2.G', topic: 'Storage, retention, and destruction', heading: 'Storage, Retention, and Destruction' },
    { standard: '2.G', topic: 'Substance use disorder records', heading: '42 CFR Part 2', showIf: 'compliance.part2' },
  ],
  consultantNotes: 'Standard letters follow the BH Section 2 numbering; letter assignments differ by manual and year. Confirm the record retention period (compliance.retentionYears) against state law, Medicaid provider agreements, and payer contracts; records of minors are usually kept until a set number of years after the age of majority. The 2-business-day documentation standard and 30-day timeframe for responding to record requests (HIPAA allows 30 days, with one 30-day extension) are suggested defaults; some payers and state rules require same-day or 24-hour notes.',
  body: `
## Purpose

To ensure that {{agency.name}} keeps a complete, accurate, timely, and secure record for each person served that supports quality services, continuity of care, and accountability.

## Scope

This policy applies to all records of persons served, in any format, and to all personnel who create, use, or maintain them.

## Policy

{{agency.name}} maintains one organized record for each person served. Entries are accurate, timely, legible, signed, and dated. Records are protected from loss, damage, and unauthorized access, and are kept for at least {{compliance.retentionYears}} years after the last date of service, or longer when law or contract requires.

## Procedures

### Record Contents

Each record contains, as applicable to the program:

- Identifying information, emergency contacts, and guardian or legal representative information with supporting documents
- Referral and screening information, and the admission or eligibility decision
- Documentation of orientation, rights notification, and informed consent
- Authorizations for release of information
- Assessments, the interpretive summary, and reassessments
- The person-centered plan, reviews, and updates
- Progress notes for each service
- Medication information, including orders, the medication administration record, and allergies, when applicable
- Health information relevant to services, such as diagnoses and physician contacts
- Incident reports involving the person, kept in the record or cross-referenced according to the incident policy
- Correspondence and coordination with other providers
- Transition plans, the discharge summary, and follow-up contacts

### Timeliness of Documentation

Progress notes are completed and signed within 2 business days of the service. Assessments, plans, and discharge summaries are completed within the timeframes in their related policies. Supervisors review documentation timeliness regularly, and late documentation is addressed through supervision.

### Electronic Records

{{agency.name}} uses {{ops.ehrSystem || "an electronic health record system"}} as the primary record. Each user has a unique login and password and may not share credentials. Access is based on job role and limited to the minimum information needed. Electronic signatures carry the same authority as handwritten signatures and are attributed to the logged-in user. The system keeps an audit trail of access and changes, and the {{roles.it.title}} ensures that data are backed up and recoverable. Paper documents received from outside sources are scanned into the record and the paper originals are handled according to this policy.

### Corrections and Late Entries

Entries are never deleted, obliterated, or altered to hide original content. To correct a paper entry, the author draws a single line through the error, writes the correction, and initials and dates the change. Electronic corrections use the system's amendment function, which keeps the original entry visible in the audit trail. A late entry is clearly labeled as a late entry, with the date it was written and the date of the service it describes.

### Access by Persons Served

Persons served (or their legal representatives) may request to see or obtain a copy of their record. Requests are made to the {{roles.privacy.title}} and are answered within 30 calendar days. A clinician may review the record with the person to help explain it. Access may be limited only as permitted by law, and any denial is given in writing with the reason and how to request a review. Persons served may ask for an amendment to information they believe is incorrect; the request and the response are kept in the record.

### Storage, Retention, and Destruction

Paper records are kept in locked cabinets in locked areas and are never left unattended. Records taken into the community are kept on the person of the staff member or locked out of sight, and returned the same day. Electronic records are accessed only on agency-approved devices with encryption and automatic screen lock.

Records are kept for at least {{compliance.retentionYears}} years after the last date of service{{#if program.servesMinors}}, and records of minors are kept until at least {{compliance.retentionYears}} years after the person reaches the age of majority, whichever is longer{{/if}}. Records involved in a pending legal action, audit, or investigation are kept until it is resolved. When the retention period ends, records are destroyed by shredding, pulping, or secure electronic deletion so that they cannot be reconstructed, and a destruction log identifies the records, date, method, and person responsible. A vendor used for destruction provides a certificate of destruction.

If {{agency.name}} closes, the {{roles.executive.title}} arranges for the secure storage and continued availability of records for the full retention period and notifies {{compliance.licensingAgency || "the state licensing agency"}}.

{{#if compliance.part2}}### 42 CFR Part 2

Records that identify a person as having applied for or received substance use disorder services from a federally assisted program are protected by 42 CFR Part 2 in addition to other privacy laws. These records are flagged in {{ops.ehrSystem || "the electronic health record"}} so that personnel recognize them. Information from these records is disclosed only with a written consent that meets Part 2 requirements or under a specific Part 2 exception, and every disclosure is accompanied by the required notice prohibiting redisclosure. Part 2 records may not be used in civil, criminal, administrative, or legislative proceedings against the person served without the person's consent or a qualifying court order.

{{/if}}## Responsibilities

The {{roles.privacy.title}} oversees record access and release. The {{roles.it.title}} maintains electronic record security and backups. Supervisors monitor documentation timeliness. All personnel document accurately and protect records.
`,
};
