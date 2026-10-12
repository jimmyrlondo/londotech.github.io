export default {
  id: 'technology',
  number: '1.18',
  section: 'ASPIRE',
  standard: '1.J',
  topic: 'Technology',
  title: 'Technology and Information Security',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.J', topic: 'Technology and system plan', heading: 'Technology Plan' },
    { standard: '1.J', topic: 'Hardware, software, and electronic records', heading: 'Hardware, Software, and Electronic Records' },
    { standard: '1.J', topic: 'Security and access controls', heading: 'Cybersecurity' },
    { standard: '1.J', topic: 'Backup, recovery, and disaster recovery testing', heading: 'Backup and Disaster Recovery' },
    { standard: '1.J', topic: 'Technology training and acceptable use', heading: 'Training and Acceptable Use' },
    { standard: '1.J', topic: 'Assistive technology', heading: 'Assistive Technology' },
    { standard: '1.J', topic: 'Information and communication technologies for service delivery', heading: 'Telehealth', showIf: 'program.telehealth' },
  ],
  consultantNotes: 'Technology has appeared as 1.J in recent ASPIRE sections (with workforce at 1.I); lettering may shift between manual years, so verify the crosswalk. CARF has specific standards for services delivered through information and communication technologies (telehealth); confirm the current list and that the agency\'s telehealth informed consent form addresses them. Confirm the telehealth platform has a signed BAA if the agency is a HIPAA covered entity. Confirm licensure-across-state-lines rules with each relevant professional board (interstate compacts such as PSYPACT or the Counseling Compact may apply). The HIPAA Security Rule requires a documented risk analysis; if one has not been done, flag it as a gap. The quarterly access review and annual restore test are recommended defaults.',
  body: `
## Purpose

{{agency.name}} uses technology to support service delivery, operations, and performance improvement, and protects the confidentiality, integrity, and availability of its information. This policy describes how technology is planned, secured, backed up, and used.

## Scope

This policy applies to all personnel, all agency-owned and agency-approved devices, systems, networks, and software, and all information created or maintained by {{agency.name}}{{#if ops.remoteWork}}, including when personnel work remotely{{/if}}.

## Policy

The {{roles.it.title}} manages the agency's technology under the direction of the {{roles.executive.title}}. Technology decisions are guided by a written technology and system plan, and information about persons served is protected by administrative, physical, and technical safeguards{{#if compliance.hipaa}} that meet the HIPAA Security Rule{{/if}}.

## Procedures

### Technology Plan

The {{roles.it.title}} maintains a written technology and system plan, reviewed and updated at least annually, that addresses current hardware, software, and network systems, security, information management, backup and recovery, technology support, training needs, assistive technology, and planned acquisitions and replacements with their budget implications. The plan is informed by input from personnel and persons served and by the agency's strategic plan.

### Hardware, Software, and Electronic Records

The {{roles.it.title}} keeps an inventory of hardware and software, approves all software and services before use, and retires devices securely by wiping or destroying storage media. Records of persons served are kept in {{ops.ehrSystem || "the agency's electronic health record"}}, which is the official record. Personnel do not keep information about persons served in personal email, personal cloud storage, text messages on personal devices, or unapproved applications. Vendors that store or process information about persons served sign a business associate agreement or equivalent confidentiality agreement before use.

### Cybersecurity

- **Access controls.** Each user has a unique account. Access is granted on a minimum necessary basis, approved by the supervisor, and removed on the day of separation. The {{roles.it.title}} reviews user access at least quarterly.
- **Multi-factor authentication.** Multi-factor authentication is required for email, {{ops.ehrSystem || "the electronic health record"}}, remote access, and any system containing information about persons served.
- **Passwords and screen locks.** Strong passwords or passphrases are required, and devices lock automatically after a short period of inactivity.
- **Encryption.** Laptops, phones, and removable media that may hold information about persons served are encrypted, and information sent outside the agency is sent by encrypted means.
- **Malware protection and patching.** All devices run agency-managed antivirus or endpoint protection, and operating system and application security updates are applied promptly.
- **Risk assessment.** A security risk assessment is completed at least annually and when major systems change, and identified risks are tracked to resolution.
- **Incident response.** Personnel report suspected phishing, lost or stolen devices, and possible breaches to the {{roles.it.title}} and the {{roles.privacy.title}} immediately. Breaches are assessed and notifications made as required by law.

### Backup and Disaster Recovery

Critical data is backed up automatically to a secure, encrypted, off-site or cloud location. For cloud systems, the {{roles.it.title}} confirms the vendor's backup and recovery commitments in the contract. The disaster recovery plan identifies critical systems, recovery priorities, and how services continue during an outage, including downtime procedures and forms. Restoration from backup and the disaster recovery plan are tested at least annually, and the results and any corrective actions are documented.

### Training and Acceptable Use

Personnel receive technology and security training at orientation and at least annually, including phishing awareness, safe use of the electronic health record, and this policy. Agency technology is for agency business, and personnel have no expectation of privacy in agency systems. Personnel may not install unapproved software, share accounts, bypass security controls, or use agency systems for unlawful, harassing, or discriminatory purposes. Use of social media must not disclose any information about persons served.

### Assistive Technology

{{agency.name}} identifies and provides assistive technology that supports persons served and personnel, such as screen readers, captioning, text enlargement, alternative input devices, and communication devices. Requests are handled through the accessibility and reasonable accommodation process, and the agency website and electronic materials are designed to be accessible.

{{#if program.telehealth}}### Telehealth

{{agency.name}} delivers some services through telehealth using {{ops.telehealthPlatform || "an agency-approved, secure telehealth platform"}}{{#if compliance.hipaa}}, under a business associate agreement{{/if}}. Personnel use only the approved platform and agency devices.

- **Appropriateness.** The provider determines with the person served whether telehealth is appropriate for the service and the person's needs, and in-person services remain available.
- **Informed consent.** Before the first telehealth session, the person served{{#if program.servesMinors}}, or a minor's parent or guardian,{{/if}} gives informed consent that addresses the benefits and risks of telehealth, privacy, what happens if the connection fails, and the right to decline.
- **Privacy.** Providers conduct sessions from a private space where they cannot be overheard, confirm the person served is in a place where they can speak privately, and do not record sessions without written consent.
- **Identity and location.** At the start of each session, the provider verifies the identity of the person served and confirms and documents their physical location and a callback number.
- **Emergencies.** The provider knows local emergency resources for the person's location before each session. If the person is in crisis, the provider keeps them connected while arranging help through 911 or local crisis services, and uses the callback number if the connection drops.
- **Licensure.** Providers hold licensure or authorization required by the state where the person served is located at the time of service, including when the person is temporarily out of state.
- **Training and equipment.** Providers are trained on the platform and telehealth practice, and persons served receive help testing their connection and using the platform.
{{/if}}
## Responsibilities

- The {{roles.it.title}} manages the technology plan, security controls, backups, and inventory.
- The {{roles.privacy.title}} oversees privacy of information about persons served and breach response.
- Supervisors approve access for their personnel and request removal at separation.
- All personnel follow this policy and report security concerns immediately.

## Related Documents

- Technology and system plan
- Disaster recovery plan and downtime procedures
- Accessibility
`,
};
