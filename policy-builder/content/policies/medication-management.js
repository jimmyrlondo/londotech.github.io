export default {
  id: 'medication-management',
  number: '2.06',
  section: 'PROGRAM',
  standard: '2.E',
  topic: 'Medication Use',
  title: 'Medication Management',
  manuals: ['BH', 'ECS', 'AS', 'CYS', 'OTP'],
  appliesIf: 'ops.medsAny',
  standardsYear: 2026,
  crosswalk: [
    { standard: '2.E', topic: 'Medication storage and security', heading: 'Storage and Security' },
    { standard: '2.E', topic: 'Administration and documentation', heading: 'Administration by Personnel', showIf: 'ops.administersMeds' },
    { standard: '2.E', topic: 'Self-administration', heading: 'Self-Administration Assessment' },
    { standard: '2.E', topic: 'Support for self-administration', heading: 'Support for Self-Administration', showIf: 'ops.medication == "monitor"' },
    { standard: '2.E', topic: 'Prescriber orders and PRN medications', heading: 'Prescriber Orders and PRN Medications', showIf: 'ops.administersMeds' },
    { standard: '2.E', topic: 'Psychotropic medications', heading: 'Psychotropic Medications', showIf: 'ops.administersMeds' },
    { standard: '2.E', topic: 'Prescribing practices and peer review', heading: 'Prescribing Practices and Peer Review', showIf: 'ops.prescribes' },
    { standard: '2.E', topic: 'Medication errors', heading: 'Medication Errors' },
    { standard: '2.E', topic: 'Disposal', heading: 'Disposal of Medications' },
    { standard: '2.E', topic: 'Education and informed consent', heading: 'Education and Informed Consent' },
    { standard: '2.E', topic: 'Training of personnel', heading: 'Personnel Training and Certification' },
  ],
  consultantNotes: 'Standard letters follow the BH Section 2 numbering (2.E Medication Use); letter assignments differ by manual and year, and CARF scores medication standards differently depending on whether the program prescribes, administers, or only monitors, so confirm which standards apply. STATE-SPECIFIC: which unlicensed personnel may administer or assist with medications, and the certification, delegation, and nurse oversight required (for example, Ohio DD medication administration certification under OAC 5123-6), varies widely by state and by licensing agency; fill in the exact rule and certificate names. Confirm refrigerator temperature range (36 to 46 degrees F is typical), controlled substance count frequency (every shift change is typical in residential), the 1-hour administration window, error reporting timeframe, and disposal methods with the state board of pharmacy and the licensing agency. OTP programs must also follow 42 CFR Part 8 and DEA rules for dispensing, take-home doses, and diversion control; consider a separate OTP dosing policy.',
  body: `
## Purpose

To ensure that medications used by persons served at {{agency.name}} are handled safely, documented accurately, and used with the informed consent and active involvement of each person served.

## Scope

This policy applies to every program of {{agency.name}} in which personnel {{#if ops.prescribes}}prescribe, administer, store, or monitor{{else}}{{#if ops.administersMeds}}administer, store, or monitor{{else}}monitor or assist with{{/if}}{{/if}} medications, and to all personnel who perform those duties.

## Policy

{{agency.name}} handles medications only within the scope permitted by {{compliance.licensingAgency || "the state licensing agency"}} and state law, and only by personnel trained and authorized for the task. Persons served are supported to be as independent as possible in managing their own medications.

## Procedures

### Storage and Security

Medications held by {{agency.name}} are:

- Kept in their original pharmacy-labeled containers, in a locked cabinet, cart, or box accessible only to authorized personnel
- Stored separately for each person served, and separately from food, cleaning products, and external-use products
- Kept at the temperature the label requires; refrigerated medications are stored in a locked container or dedicated refrigerator with a temperature log checked daily, kept between 36 and 46 degrees Fahrenheit
- Checked monthly for expiration dates, recalls, and damaged packaging

Controlled substances are stored under double lock (a locked container within a locked cabinet or room). Personnel count controlled substances at each shift change where personnel hold keys, or at least daily, with two people signing the count log. Any discrepancy is reported immediately to the supervisor and investigated as a medication error.

### Self-Administration Assessment

Persons served are presumed able to manage their own medications unless an assessment shows that support is needed. Personnel assess each person's ability to self-administer at admission, at each plan review, and after any change in condition or medication regimen. The assessment considers the person's ability to identify each medication, know its purpose, take the right dose at the right time, recognize side effects, and store medications safely. The level of support needed is written into the person-centered plan, along with steps to increase independence.

{{#if ops.medication == "monitor"}}### Support for Self-Administration

Personnel at {{agency.name}} do not administer medications. Within the limits of state law, they may remind persons served when a dose is due, hand a person their own labeled container, open a container on request, observe the person taking the medication, and record that the person took or declined it. Personnel do not prepare, measure, or decide doses. Any concern about missed doses, side effects, or misuse is reported to the person's prescriber (with consent) and documented.

{{/if}}{{#if ops.administersMeds}}### Administration by Personnel

Only licensed nurses, or unlicensed personnel who hold current certification or delegation as required by state law, administer medications. Personnel follow the rights of medication administration for every dose: the right person, right medication, right dose, right time, right route, right reason, right documentation, and the person's right to refuse.

- Medications are given only on a current written order from a licensed prescriber, and the pharmacy label must match the order
- Doses are given within 1 hour before or after the scheduled time unless the order states otherwise
- Each dose is recorded on the medication administration record (MAR) at the time it is given, with the time and the initials of the person who gave it
- Refusals, held doses, and missed doses are recorded with the reason and reported to the supervisor and, when clinically relevant, the prescriber
- Telephone or verbal orders are taken only by licensed personnel, read back, and confirmed in writing by the prescriber

### Prescriber Orders and PRN Medications

New, changed, and discontinued orders are transcribed onto the MAR and checked by a second qualified person within 24 hours. PRN (as needed) medications require an order that states the specific reason for use, the dose, the minimum interval, and the maximum in 24 hours. Before giving a PRN, personnel document the reason; afterward, they document its effect. Frequent PRN use is reported to the prescriber and the team.

### Psychotropic Medications

Psychotropic medications are used only to treat a diagnosed condition, never for staff convenience, discipline, or as a substitute for services. The prescriber's rationale, target symptoms, and monitoring for side effects (including involuntary movements and metabolic effects where relevant) are documented. A psychotropic PRN given to manage behavior is reviewed by the {{roles.clinical.title}} and is never used as a chemical restraint.

{{/if}}{{#if ops.prescribes}}### Prescribing Practices and Peer Review

Agency prescribers practice within their license and current clinical guidelines, review the person's full medication list and allergies before prescribing, check the state prescription drug monitoring program before prescribing controlled substances, and document the reason for each medication and the plan for monitoring. Prescribers order and review laboratory tests needed to monitor medication safety.

The {{roles.clinical.title}} arranges a peer review of prescribing practices at least quarterly, in which a qualified prescriber reviews a sample of records for appropriateness of medication choice, dosing, polypharmacy, monitoring, informed consent, and documentation. Findings are shared with each prescriber and reported to the {{roles.quality.title}}.

{{/if}}### Education and Informed Consent

Before a new medication is started, the person served (or guardian) is told, in language they understand, the name and purpose of the medication, how to take it, expected benefits, common and serious side effects, interactions, and alternatives, including the option of no medication. Informed consent is documented{{#if ops.prescribes}} by the prescriber{{/if}}. Persons served may refuse a medication, and a refusal is respected, documented, and reported to the prescriber. Ongoing education is offered at plan reviews.

### Medication Errors

A medication error includes a wrong person, medication, dose, time, or route, an omitted dose, a documentation error, and any count discrepancy. When an error occurs, personnel:

1. Check on the person served immediately and call 911 if there is any sign of a serious reaction.
2. Notify the supervisor and, as instructed, the prescriber or pharmacist.
3. Document the error and the response.
4. Report the error as an incident under the critical incident policy; errors that cause harm, require medical treatment, or involve controlled substances are treated as critical incidents and reported externally as required.

The {{roles.quality.title}} reviews medication errors for trends and corrective action.

### Disposal of Medications

Discontinued, expired, contaminated, or refused medications are disposed of through a pharmacy take-back program, a DEA-authorized collection site, or another method approved by the licensing agency. Disposal of controlled substances is witnessed by two personnel and recorded in a disposal log. Medications belonging to a person who leaves services are returned to the person or guardian and the return is documented.

### Personnel Training and Certification

Personnel who handle medications complete training before performing these duties and refresher training at least annually. Training covers this policy, the rights of administration, documentation, side effects, errors, and storage. Unlicensed personnel complete any certification required by state law and keep it current. The {{roles.hr.title}} tracks certification expiration dates, and personnel with lapsed certification do not handle medications until it is renewed.

## Responsibilities

The {{roles.clinical.title}} oversees medication practices{{#if ops.administersMeds}}, nursing delegation,{{/if}} and training content. Supervisors monitor storage, counts, and documentation. The {{roles.quality.title}} reviews errors and audit results.
`,
};
