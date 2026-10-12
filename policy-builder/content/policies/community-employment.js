export default {
  id: 'community-employment',
  number: '3.20',
  section: 'SPECIFIC',
  standard: 'ECS 3',
  topic: 'Community Employment Services',
  title: 'Community Employment Services',
  manuals: ['ECS'],
  appliesIf: 'program.ecsPrograms contains "communityEmployment"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'ECS 3', topic: 'Community employment program description', heading: 'Program Description' },
    { standard: 'ECS 3', topic: 'Discovery and career planning', heading: 'Discovery and Career Planning' },
    { standard: 'ECS 3', topic: 'Job development and employer relationships', heading: 'Job Development and Employer Relationships' },
    { standard: 'ECS 3', topic: 'Job supports, coaching, and fading', heading: 'Job Supports, Coaching, and Fading' },
    { standard: 'ECS 3', topic: 'Benefits counseling and vocational rehabilitation coordination', heading: 'Coordination' },
    { standard: 'ECS 3', topic: 'Follow-along and transition', heading: 'Follow-Along and Transition' },
    { standard: 'ECS 3', topic: 'Employment outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'CARF ECS section and letter numbering for Community Employment Services (Job Development and Job Supports) varies by manual year; "ECS 3" is a placeholder, verify against the current ECS manual and map each crosswalk row to its letter. Timeframes here (discovery profile within 60 days, job search activity at least weekly, job coach contact at least weekly until fading begins, fading plan reviewed every 30 days, follow-along at least monthly for 90 days after fading or the period the funder requires) are suggested defaults: confirm against the state VR agency fee schedule and milestones, the Medicaid waiver service definition, and county board rules. The agency should name its benefits counseling partner (for example a Work Incentives Planning and Assistance project) and confirm whether it is an Employment Network under Ticket to Work.',
  body: `
## Purpose

To describe how {{agency.name}} helps persons served find, keep, and advance in competitive integrated employment that matches their interests, strengths, and goals.

## Scope

This policy applies to the Community Employment Services program of {{agency.name}}, including job development and job supports, and to all employment specialists, job coaches, and supervisors who deliver it. Assessment, planning, and discharge in general follow Policy 2.03 Assessment of Persons Served and Policy 2.04 Person-Centered Planning.

## Program Description

Community Employment Services supports {{list program.populationLabels}} who want a job in the general workforce. The goal of every placement is competitive integrated employment: work in a typical community business, alongside coworkers without disabilities, at or above the applicable minimum wage and at the wage and benefits paid to others doing similar work. Services are offered {{program.hours || "during the hours listed in the program description, with job coaching scheduled around each person's work shift"}}.{{#if program.payers}} Funding sources include {{list program.payers}}.{{/if}}

## Eligibility and Admission

The program serves persons who express a desire to work in the community and who have a funding authorization or an agreed payment arrangement. No one is screened out because of the severity of a disability, a lack of work history, or a presumed need for ongoing support. Screening and admission follow Policy 2.02 Screening and Access to Services.

## Staffing and Qualifications

Employment specialists and job coaches complete training in discovery, job development, systematic instruction, and disability disclosure within 90 days of hire, and hold any employment-services certification a funder requires.

## Discovery and Career Planning

Before job development begins, the employment specialist gets to know the person in real settings, including the community, workplace visits, informational interviews, and job shadows. Discovery identifies interests, skills, preferred work conditions (hours, pace, noise, travel), learning style, and needed accommodations. The specialist completes a written discovery profile within 60 days of admission, and the person's employment goal is written into the person-centered plan.

## Job Development and Employer Relationships

Employment specialists develop jobs around the person, not around whatever openings exist. Job development activities include:

- Contacting employers matched to the discovery profile at least weekly while the person is in active job search
- Negotiating customized job duties, schedules, or carved positions when a standard posting is not a good fit
- Explaining reasonable accommodations and available employer incentives
- Representing the person only with their permission, and disclosing a disability only as the person chooses

Personnel log employer contacts, respond to employer concerns within 2 business days, and never accept a placement below minimum wage.

## Job Supports, Coaching, and Fading

Once hired, the person receives the job coaching needed to learn the job and fit into the workplace. Before the first day, the job coach writes a support plan that names the tasks to be taught, the teaching strategies to be used, and a fading plan describing how coach presence will decrease as the person gains independence. The coach builds natural supports from the start by involving supervisors and coworkers in training and workplace routines. The fading plan is reviewed with the person at least every 30 days and adjusted when job duties, supervisors, or schedules change.{{#if ops.transportation}} When the person needs a ride to work during the early weeks of a job, {{agency.name}} may provide it under Policy 1.15 Transportation of Persons Served while the coach helps the person plan a lasting commute.{{/if}}

{{#if program.populations contains "idd"}}For persons with intellectual or developmental disabilities, coaches use systematic instruction, task analysis, and visual or picture supports as needed, and they share teaching strategies with the person's other support providers so the approach stays consistent.

{{/if}}## Coordination

With the person's written authorization, personnel coordinate with:

- The state vocational rehabilitation agency{{#if compliance.vrAgency}} ({{compliance.vrAgency}}){{/if}}, including referral, authorization of services, milestone reporting, and case closure documentation
- A certified benefits counselor, to whom each person receiving disability benefits is referred before accepting a job offer and again when earnings change
- Residential, case management, and other providers so work schedules and supports fit together
- Schools and transition programs for youth moving from school to work

## Follow-Along and Transition

After fading is complete, the employment specialist provides follow-along contact at least monthly for at least 90 days, or longer when the funding source or person requests it, checking on job satisfaction, employer feedback, and any new support needs. Personnel help persons pursue raises, promotion, additional hours, or a better job. When a job ends, the specialist meets with the person within 5 business days to review what happened and plan next steps. Discharge from the program follows Policy 2.05 Transition and Discharge.

## Outcomes Measured

The program tracks the number of persons placed, time from admission to placement, hourly wage, hours worked per week, job retention at 90 days and 12 months, employer satisfaction, and satisfaction of persons served. Results are reported to the {{roles.quality.title}} under Policy 1.23 Performance Measurement and Management.

## Responsibilities

The {{roles.clinical.title}} oversees the program and approves support and fading plans. Employment specialists conduct discovery, job development, and follow-along. Job coaches deliver on-site supports and document each coaching contact. The {{roles.quality.title}} analyzes employment outcomes.
`,
};
