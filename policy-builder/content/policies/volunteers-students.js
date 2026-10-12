export default {
  id: 'volunteers-students',
  number: '1.17',
  section: 'ASPIRE',
  standard: '1.I',
  topic: 'Workforce Development and Management',
  title: 'Volunteers and Students',
  manuals: ['*'],
  appliesIf: 'ops.volunteers or ops.students',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.I', topic: 'Screening of volunteers and students', heading: 'Screening' },
    { standard: '1.I', topic: 'Orientation and training', heading: 'Orientation and Training' },
    { standard: '1.I', topic: 'Supervision and defined roles', heading: 'Roles and Supervision' },
    { standard: '1.I', topic: 'Confidentiality', heading: 'Confidentiality' },
    { standard: '1.I', topic: 'Volunteers', heading: 'Volunteers', showIf: 'ops.volunteers' },
    { standard: '1.I', topic: 'Students and interns, affiliation agreements', heading: 'Students and Interns', showIf: 'ops.students' },
  ],
  consultantNotes: 'Section 1.I lettering may shift between manual years; verify the crosswalk. Confirm whether state rules require full fingerprint background checks for volunteers and students with any contact with persons served (Ohio DODD and OhioMHAS rules generally do for unsupervised contact). Confirm that school affiliation agreements address liability insurance and HIPAA training responsibilities. If volunteers drive persons served, they must meet the Transportation policy requirements.',
  body: `
## Purpose

{{agency.name}} welcomes {{#if ops.volunteers}}volunteers{{/if}}{{#if ops.volunteers and ops.students}} and {{/if}}{{#if ops.students}}students and interns{{/if}} who contribute to its mission, and ensures that they are screened, oriented, supervised, and working within defined roles that protect persons served.

## Scope

This policy applies to all {{#if ops.volunteers}}volunteers{{/if}}{{#if ops.volunteers and ops.students}} and {{/if}}{{#if ops.students}}students and interns{{/if}} who participate in agency activities, whether or not they have direct contact with persons served.

## Policy

{{#if ops.volunteers}}Volunteers{{/if}}{{#if ops.volunteers and ops.students}} and {{/if}}{{#if ops.students}}students{{/if}} supplement, and never replace, paid personnel. Each has a written description of their role, a designated supervisor, and the orientation and screening appropriate to that role. They follow the same rights, confidentiality, ethics, health and safety, and incident reporting policies as employees.

## Procedures

### Screening

Before beginning any role with contact with persons served, each candidate completes an application, an interview, reference checks, and the same criminal background, registry, and exclusion list checks required for employees in comparable roles. Those who will drive persons served also meet the requirements of the Transportation policy. Roles with no contact with persons served may have a reduced screening process approved by the {{roles.hr.title}}.

### Orientation and Training

Orientation is completed before the first assignment and covers the mission, rights of persons served, confidentiality, abuse and neglect reporting, emergency procedures, infection control, critical incident reporting, boundaries, and the specific duties of the role. Additional training is provided as the role requires, and completion is documented.

### Roles and Supervision

Each role is described in writing, including the tasks permitted, tasks not permitted, and who supervises. Volunteers and students do not work alone with persons served unless their role, screening, and training specifically allow it, and never perform tasks that require a license, certification, or medication administration training they do not hold.

### Confidentiality

Volunteers and students sign a confidentiality agreement before their first assignment. They access only the information about persons served that their role requires and follow all privacy policies{{#if compliance.hipaa}}, including HIPAA{{/if}}{{#if compliance.part2}} and 42 CFR Part 2{{/if}}.

{{#if ops.volunteers}}### Volunteers

The {{roles.hr.title}} or a designated volunteer coordinator recruits, screens, and schedules volunteers, maintains a file for each volunteer with their application, screening results, signed agreements, and training records, and recognizes volunteer contributions. Volunteers may be reassigned or released at any time when the needs of persons served or the agency require it. Volunteer feedback is gathered at least annually.
{{/if}}
{{#if ops.students}}### Students and Interns

{{agency.name}} accepts students and interns only from schools with which it has a current written affiliation agreement. The agreement defines the responsibilities of the school, the student, and the agency, including supervision, liability insurance, background checks, health screening, confidentiality, and evaluation.

Each student is assigned a qualified field supervisor who holds the credentials required by the student's program and by any licensure board. Students identify themselves as students to persons served, and persons served may decline to receive services from a student. Clinical documentation by students is reviewed and co-signed by the supervisor. The field supervisor completes evaluations required by the school.
{{/if}}
## Responsibilities

- The {{roles.hr.title}} oversees screening, files, and agreements.
- Supervisors orient, assign, and supervise volunteers and students.
- The {{roles.clinical.title}} approves clinical placements and field supervisors.

## Related Documents

- Workforce Development and Management
- Transportation of Persons Served
- Affiliation agreements and confidentiality agreements
`,
};
