export default {
  id: 'governance',
  number: '1.05',
  section: 'ASPIRE',
  standard: '1.B',
  topic: 'Governance',
  title: 'Governance',
  manuals: ['*'],
  appliesIf: 'agency.hasBoard',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.B', topic: 'Board composition and selection', heading: 'Composition and Selection' },
    { standard: '1.B', topic: 'Board orientation and development', heading: 'Orientation and Development' },
    { standard: '1.B', topic: 'Board conflict of interest', heading: 'Board Conflict of Interest' },
    { standard: '1.B', topic: 'Executive leadership evaluation', heading: 'Executive Evaluation' },
    { standard: '1.B', topic: 'Executive compensation review', heading: 'Executive Compensation' },
    { standard: '1.B', topic: 'Board self-assessment', heading: 'Board Self-Assessment' },
    { standard: '1.B', topic: 'Meetings and minutes', heading: 'Meetings and Minutes' },
    { standard: '1.B', topic: 'Policy approval', heading: 'Policy Approval' },
  ],
  consultantNotes: 'CARF governance standards apply to organizations with a governing board, and some items apply only to certain organization types (verify current 1.B applicability notes, including exemptions for government and some for-profit owner boards). Align term limits, officer roles, quorum, and meeting frequency with the bylaws and articles. For nonprofits, IRS Form 990 asks about conflict-of-interest policies and executive compensation review (rebuttable presumption process using comparability data); confirm the board actually follows it. Confirm whether the agency wants persons served or family members on the board; CARF looks favorably on representation of persons served.',
  body: `
## Purpose

This policy describes how the {{agency.governingBody}} of {{agency.name}} is organized and how it carries out its responsibilities for oversight, direction, and accountability.

## Scope

This policy applies to all members of the {{agency.governingBody}}, its committees, and the {{roles.executive.title}} in their working relationship with the {{agency.governingBody}}.

## Policy

The {{agency.governingBody}} governs {{agency.name}} in accordance with its {{#if agency.isNonprofit}}articles of incorporation, bylaws, and the obligations of a tax-exempt organization{{else}}governing documents and bylaws{{/if}}. The {{agency.governingBody}} sets direction and policy, oversees performance and finances, and holds the {{roles.executive.title}} accountable, but does not manage daily operations.

## Procedures

### Composition and Selection

1. The size, terms, and officers of the {{agency.governingBody}} are set by the bylaws.
2. A governance or nominating committee (or the full {{agency.governingBody}}) identifies the skills, experience, and perspectives needed, including financial, legal, clinical, and community expertise, and seeks members who reflect the diversity of the communities served.
3. The {{agency.governingBody}} seeks to include persons served, former persons served, or family members, or otherwise obtains their perspective through an advisory group.
4. Candidates are screened for conflicts of interest and against federal and state exclusion lists before appointment.
5. Personnel of {{agency.name}}, other than the {{roles.executive.title}} if the bylaws allow, do not serve as voting members.

### Orientation and Development

Each new member receives orientation within 90 days of appointment, covering the mission, programs, bylaws, finances, the strategic plan, legal and fiduciary duties, confidentiality, and CARF accreditation. Members receive ongoing education at least annually on topics such as compliance, financial oversight, and trends in the field.

### Board Conflict of Interest

Members sign a conflict-of-interest and confidentiality statement at appointment and annually. A member with an interest in a matter discloses it, leaves the discussion, and does not vote. Disclosures and recusals are recorded in the minutes. Members do not receive compensation from {{agency.name}} other than reimbursement of reasonable expenses{{#unless agency.isNonprofit}} unless approved under the bylaws and disclosed{{/unless}}.

### Executive Evaluation

The {{agency.governingBody}} is responsible for hiring and, when necessary, removing the {{roles.executive.title}}. It evaluates the {{roles.executive.title}}'s performance at least annually against written goals tied to the strategic plan, financial results, quality and outcome data, compliance, and leadership. The {{roles.executive.title}} completes a self-assessment as part of the review, and the results are documented and kept in a confidential personnel file.

### Executive Compensation

The {{agency.governingBody}}, or a committee it designates, reviews and approves the compensation of the {{roles.executive.title}} at least annually and at hire. The review uses comparable compensation data for similar organizations, and the decision and the data relied on are documented in the minutes. Members with a conflict do not take part.

### Board Self-Assessment

At least annually, the {{agency.governingBody}} assesses its own performance, including attendance, committee effectiveness, member engagement, and the skills mix of the board. Results are used to set governance goals and to guide recruitment.

### Meetings and Minutes

1. The {{agency.governingBody}} meets {{agency.boardMeetingFrequency || "at least quarterly"}} and as needed, with a quorum as defined in the bylaws.
2. Agendas and materials, including financial statements and the {{roles.executive.title}}'s report, are sent in advance.
3. Minutes record attendance, quorum, actions taken, votes, and conflict disclosures. They are approved at the next meeting and kept permanently.
4. Executive sessions are held as needed. Personnel and protected health information are discussed only to the extent necessary and kept confidential.

### Policy Approval

The {{agency.governingBody}} approves governance policies, the strategic plan, the annual budget, the risk management plan, and other policies the bylaws reserve to it. Operational policies and procedures are approved by the {{admin.approver}}, and the {{roles.executive.title}} keeps the {{agency.governingBody}} informed of significant policy changes. Governance policies are reviewed {{admin.reviewFrequency}}.

## Responsibilities

- Chair of the {{agency.governingBody}}: leads meetings, the executive evaluation, and the board self-assessment.
- Members: attend, prepare, act in the agency's best interest, and disclose conflicts.
- {{roles.executive.title}}: supports the {{agency.governingBody}} with timely, accurate information.

## Related Documents

- Bylaws
- Board conflict-of-interest and confidentiality statement
- Board orientation materials
- Executive evaluation form
`,
};
