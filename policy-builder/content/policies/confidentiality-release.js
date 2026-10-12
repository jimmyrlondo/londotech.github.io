export default {
  id: 'confidentiality-release',
  number: '2.10',
  section: 'PROGRAM',
  standard: '2.G',
  topic: 'Records of the Persons Served: Confidentiality and Release of Information',
  title: 'Confidentiality and Release of Information',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '2.G', topic: 'Confidentiality and minimum necessary', heading: 'Confidentiality and Minimum Necessary' },
    { standard: '2.G', topic: 'Authorization for release', heading: 'Authorization for Release of Information' },
    { standard: '2.G', topic: 'Disclosures without authorization', heading: 'Disclosures Without Authorization' },
    { standard: '2.G', topic: 'Breach response', heading: 'Responding to a Breach' },
    { standard: '2.G', topic: 'HIPAA privacy practices', heading: 'HIPAA Privacy Practices', showIf: 'compliance.hipaa' },
    { standard: '2.G', topic: 'Part 2 redisclosure', heading: 'Substance Use Disorder Records (42 CFR Part 2)', showIf: 'compliance.part2' },
    { standard: '2.G', topic: 'Confidentiality for minors', heading: 'Confidentiality and Minors', showIf: 'program.servesMinors' },
  ],
  consultantNotes: 'Standard letters follow the BH Section 2 numbering (2.G); letter assignments differ by manual and year, and MED and other manuals place records and confidentiality standards elsewhere, so map accordingly. HIPAA breach notification: individuals without unreasonable delay and no later than 60 days after discovery; HHS within 60 days for breaches of 500 or more, otherwise by 60 days after the end of the calendar year; media for 500 or more in a state. Many states have shorter breach notification laws, so confirm. Part 2 was amended in 2024 to align more closely with HIPAA (single consent for TPO, breach notification); confirm the current redisclosure notice wording and compliance dates. Minor consent and confidentiality rules (who controls a minor\'s SUD or mental health records) are state-specific.',
  body: `
## Purpose

To protect the privacy of persons served at {{agency.name}} and to ensure that information about them is used and shared only as they authorize or as the law permits.

## Scope

This policy applies to all information that identifies a person served, in any form (written, electronic, or spoken), and to all personnel, including volunteers, students, and contractors.

## Policy

Information about persons served is confidential. Personnel use and share it only when needed to do their jobs, only with a valid authorization or legal basis, and only to the minimum extent necessary. The fact that a person receives services from {{agency.name}} is itself confidential.

## Procedures

### Confidentiality and Minimum Necessary

Personnel:

- Access records only for persons they serve or when their job requires it
- Discuss persons served only in private settings and never in public areas, on social media, or with friends or family
- Share only the information needed for the purpose of the disclosure
- Keep screens, papers, and devices secured from view
- Do not confirm or deny that someone is a person served to callers or visitors without authorization
- Sign a confidentiality agreement at hire and complete confidentiality training at orientation and annually

### Authorization for Release of Information

Except as allowed below, information is released only with a written authorization signed by the person served or their legal representative. A valid authorization includes:

- The name of the person served
- The name of {{agency.name}} as the party disclosing the information
- The name of the person or organization receiving the information
- A specific description of the information to be released
- The purpose of the disclosure
- An expiration date or event
- A statement that the authorization may be revoked in writing at any time, except to the extent action has already been taken
- A statement that services are not conditioned on signing, where applicable
- The signature of the person served or legal representative, and the date

Authorizations are filed in the record. Personnel check that an authorization is current and covers the request before releasing anything, and each release is logged with the date, recipient, and information released.

### Disclosures Without Authorization

Information may be disclosed without authorization only as permitted or required by law, including:

- In a medical emergency, to medical personnel to the extent needed to treat the person
- To report suspected abuse, neglect, or exploitation to {{compliance.abuseReportingAgency || "the appropriate protective services agency"}} as required by law
- To warn or protect when a person served makes a serious threat of harm to an identifiable person, as permitted by state law
- In response to a valid court order (a subpoena alone is not sufficient; personnel forward subpoenas to the {{roles.privacy.title}})
- To {{compliance.licensingAgency || "the state licensing agency"}}, payers, and accrediting bodies for oversight and audit, under appropriate confidentiality protections

Each disclosure without authorization is approved by the {{roles.privacy.title}} when time permits and documented in the record.

{{#if program.servesMinors}}### Confidentiality and Minors

For a minor, the parent or legal guardian generally controls the release of information, except where {{agency.state || "state"}} law allows the minor to consent to their own treatment and to control the related information. Personnel explain the limits of confidentiality to both the youth and the guardian at the start of services, including the duty to report abuse and safety concerns. Personnel verify custody and guardianship before releasing information to a parent.

{{/if}}{{#if compliance.hipaa}}### HIPAA Privacy Practices

{{agency.name}} is a covered entity under HIPAA. The {{roles.privacy.title}} serves as the designated Privacy Officer, responsible for privacy policies, training, complaints, and breach response. Each person served receives the Notice of Privacy Practices at the first service, and personnel make a good-faith effort to obtain written acknowledgment. The notice is posted at each service location and on the agency website. Persons served may request access, amendment, an accounting of disclosures, restrictions, and confidential communications, and may file a privacy complaint with the agency or with the U.S. Department of Health and Human Services without retaliation. {{agency.name}} has a business associate agreement with every vendor that handles protected health information on its behalf.

{{/if}}{{#if compliance.part2}}### Substance Use Disorder Records (42 CFR Part 2)

Records of substance use disorder services covered by 42 CFR Part 2 are disclosed only with a consent that meets Part 2 requirements or under a Part 2 exception. Each disclosure made with consent is accompanied by the written notice required by Part 2 stating that the information is protected by federal law and that the recipient may not further disclose it except as permitted by 42 CFR Part 2. Part 2 information may not be used to investigate or prosecute the person served without a qualifying court order.

{{/if}}### Responding to a Breach

Any personnel who learns of a possible unauthorized use or disclosure, lost device, misdirected communication, or improper access reports it to the {{roles.privacy.title}} immediately and no later than the end of the workday. The {{roles.privacy.title}}:

1. Acts to contain the breach, for example by retrieving information or disabling accounts.
2. Investigates what happened, what information was involved, and who was affected.
3. Assesses the risk that the information was compromised and documents the assessment.
4. Notifies affected persons served and any required authorities within the timeframes required by law.{{#if compliance.hipaa}} Under HIPAA, affected individuals are notified without unreasonable delay and no later than 60 calendar days after discovery, and the U.S. Department of Health and Human Services (and, for breaches of 500 or more residents of a state, the media) is notified as the rule requires.{{/if}}
5. Recommends corrective action, including discipline and retraining where appropriate.
6. Keeps breach documentation for at least six years.

## Responsibilities

The {{roles.privacy.title}} oversees confidentiality practices, approves non-routine disclosures, and leads breach response. Supervisors ensure personnel are trained. All personnel protect the information of persons served.
`,
};
