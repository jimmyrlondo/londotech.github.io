export default {
  id: 'employee-development',
  number: '3.21',
  section: 'SPECIFIC',
  standard: 'ECS 3',
  topic: 'Employee Development Services',
  title: 'Employee Development Services',
  manuals: ['ECS'],
  appliesIf: 'program.ecsPrograms contains "employeeDevelopment"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'ECS 3', topic: 'Employee development program description', heading: 'Program Description' },
    { standard: 'ECS 3', topic: 'Informed choice', heading: 'Informed Choice' },
    { standard: 'ECS 3', topic: 'Work and skill development', heading: 'Service Components' },
    { standard: 'ECS 3', topic: 'Path to integrated employment', heading: 'Path to Integrated Employment' },
    { standard: 'ECS 3', topic: 'Wage and hour compliance', heading: 'Wages, Hours, and Working Conditions' },
    { standard: 'ECS 3', topic: 'Section 14(c) certificate compliance', heading: 'Special Minimum Wage Certificate', showIf: 'ops.subminimumWage' },
    { standard: 'ECS 3', topic: 'Outcomes', heading: 'Outcomes Measured' },
  ],
  consultantNotes: 'Verify the ECS section and letter for Employee Development Services in the current manual; "ECS 3" is a placeholder. The wage section follows the intake answer on a Fair Labor Standards Act Section 14(c) certificate: without one, it states that every worker is paid at least minimum wage; with one, it adds the Special Minimum Wage Certificate subsection (prevailing wage surveys, time studies and wage review at least every 6 months, written notice of the right to petition, and annual career counseling with information on integrated employment). 14(c) rules are changing: several states have ended or are phasing out subminimum wage, and federal rulemaking to end new 14(c) certificates has been in flux, so confirm the current federal and state status, any state counseling or phase-out requirements, and whether the certificate is still valid before finalizing. Timeframes (informed choice review at least every 6 months, community exposure at least quarterly) are suggested defaults.',
  body: `
## Purpose

To describe how {{agency.name}} provides agency-based work and skill development that builds each person's readiness for, and movement toward, competitive integrated employment, and to set wage, hour, and working condition protections for persons served who perform work.

## Scope

This policy applies to the Employee Development Services program of {{agency.name}} and to the production supervisors, instructors, and program managers who deliver it. Assessment, planning, records, and discharge in general are covered by Policies 2.03, 2.04, 2.08, and 2.05.

## Program Description

Employee Development Services offers paid or unpaid work and skill-building activities in an agency-operated setting{{#if multipleLocations}} at one or more agency locations{{/if}}. Activities may include contract production work, simulated work stations, and classroom instruction in job-related skills. The program serves {{list program.populationLabels}} and operates {{program.hours || "during the hours stated in the program description"}}.{{#if program.payers}} Funding sources include {{list program.payers}}.{{/if}}

The program is a step toward community work, not a destination. Every person in the program has a written employment goal and a plan for reaching it.

## Eligibility and Admission

Persons are admitted when they choose this service after receiving information about community employment options, and when a funding authorization or payment arrangement is in place. Admission follows Policy 2.02 Screening and Access to Services.

## Informed Choice

Before admission and at least every 6 months afterward, personnel explain in plain language the full range of employment options, including community employment, self-employment, and supported employment, and the differences in pay, setting, and supports. Persons who have not had real community work experience are offered tours, job shadows, or community work trials so their choice is based on experience rather than assumption. The person's choice, and the information they received, are documented in the record.

## Service Components

- Instruction in work skills such as task completion, quality standards, speed, and use of tools and equipment
- Instruction in soft skills such as attendance, punctuality, communication with supervisors, and teamwork
- Safety training for every work station before the person is assigned to it
- Career exploration, resume building, and interview practice
- Regular feedback on work performance, shared in a way the person understands

## Path to Integrated Employment

Each person's plan states the skills the person is working on, how progress is measured, and the next step toward community work. Personnel arrange community exposure (job shadows, tours, or volunteer experiences) at least quarterly for each person who wants it. When a person expresses interest in community work or meets the goals in their plan, personnel make a referral to {{#if program.ecsPrograms contains "communityEmployment"}}the agency's own community employment program (Policy 3.20 Community Employment Services) or another provider the person chooses{{else}}a community employment provider the person chooses{{/if}} within 30 days.

## Wages, Hours, and Working Conditions

Persons served who perform work that benefits {{agency.name}} or its customers are paid in compliance with federal and {{agency.stateName || "state"}} wage and hour law. {{#if ops.subminimumWage}}Pay is at or above the applicable minimum wage except where a Section 14(c) certificate held by {{agency.name}} under the Fair Labor Standards Act lawfully authorizes a commensurate wage, as described below.{{else}}Every person served who performs work is paid at least the applicable federal, state, or local minimum wage, whichever is highest, and is paid the same as other workers doing the same work.{{/if}} The {{roles.finance.title}} maintains accurate time and pay records, issues pay stubs, and ensures that payroll taxes and benefits are handled as for any other worker.

{{#if ops.subminimumWage}}### Special Minimum Wage Certificate

{{agency.name}} pays a commensurate (special minimum) wage only while it holds a valid, unexpired Section 14(c) certificate from the U.S. Department of Labor, and only to workers whose disability impairs their productivity for the specific work performed. The {{roles.finance.title}} tracks the certificate expiration date and files for renewal on time, and the certificate notice is posted where workers can see it.

1. Each commensurate wage is based on the prevailing wage paid to experienced workers without disabilities for the same or similar work in the area, documented with a current prevailing wage survey.
2. Each worker's productivity is measured with time studies or other objective work measurement, and wages are reviewed and adjusted at least every 6 months, and whenever the person's job or the prevailing wage changes.
3. Each affected worker, and their guardian where one is appointed, is told in writing and in plain language how their pay is set, the right to petition the Department of Labor for a review of their wage, and how pay can change.
4. Before a worker starts at a commensurate wage and at least annually afterward, the worker receives career counseling and information about competitive integrated employment, community employment services, and benefits counseling, and makes an informed choice about continuing. These sessions are documented in the record.
5. Payroll, productivity, and prevailing wage records are kept for the period federal law requires and are available to the Department of Labor on request.

{{/if}}

Work stations meet the safety requirements in Policy 1.12 Health and Safety. Breaks and meal periods follow the same rules as for other employees. No person is required to work as a condition of receiving other services.{{#if ops.clientFunds}} Wages are paid to the person and are never applied to fees or deposited into agency-managed accounts without the person's written consent under Policy 1.10 Funds of Persons Served.{{/if}}

## Staffing and Qualifications

Production supervisors and instructors receive training in systematic instruction, work-station safety, wage and hour basics, and informed choice before supervising persons served. The {{roles.clinical.title}} supervises program personnel.

## Outcomes Measured

The program tracks the number of persons who move into community employment each year, time in program, average hourly earnings, skill gains, and satisfaction of persons served. Results are reported to the {{roles.quality.title}} under Policy 1.23 Performance Measurement and Management.

## Responsibilities

The {{roles.clinical.title}} oversees the program, informed choice reviews, and referrals to community employment. The {{roles.finance.title}} maintains wage records and any wage certificate compliance. The {{roles.compliance.title}} reviews wage and hour practices at least annually.
`,
};
