export default {
  id: 'transportation',
  number: '1.15',
  section: 'ASPIRE',
  standard: '1.H',
  topic: 'Health and Safety',
  title: 'Transportation of Persons Served',
  manuals: ['*'],
  appliesIf: 'ops.transportation',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.H', topic: 'Driver qualifications and record checks', heading: 'Driver Qualifications' },
    { standard: '1.H', topic: 'Vehicle insurance', heading: 'Insurance' },
    { standard: '1.H', topic: 'Vehicle inspection and maintenance', heading: 'Vehicle Inspection and Maintenance' },
    { standard: '1.H', topic: 'Safety equipment and emergency procedures in vehicles', heading: 'Safety Equipment and Emergencies' },
    { standard: '1.H', topic: 'Passenger supervision', heading: 'Passenger Safety and Supervision' },
    { standard: '1.H', topic: 'Vehicle accidents', heading: 'Accidents' },
  ],
  consultantNotes: 'Section 1.H lettering may shift between manual years; verify the crosswalk. Confirm the minimum driver age, years of licensure, and disqualifying violations with the agency insurer (insurers often set stricter criteria than below). Confirm state rules for driving record (MVR) checks; some state programs require annual checks and enrollment in continuous monitoring. Confirm liability limits required by funders and the state. If the agency transports wheelchair users, add lift and securement training and inspection. If the agency only uses personal vehicles (no fleet), simplify the fleet maintenance language. Confirm child passenger safety seat rules if minors are transported.',
  body: `
## Purpose

{{agency.name}} transports persons served safely, using qualified drivers and safe, insured, well-maintained vehicles.

## Scope

This policy applies to all personnel who transport persons served, in agency-owned or leased vehicles and in personal vehicles used for agency business, and to all transportation arranged or provided as part of services.

## Policy

Only authorized drivers who meet the qualifications in this policy transport persons served. Every vehicle used to transport persons served is properly registered, insured, inspected, maintained, and equipped for emergencies. Transportation is planned around each person's needs, including any physical, behavioral, or supervision needs documented in the person's plan.

## Procedures

### Driver Qualifications

Before transporting persons served, and on an ongoing basis, each driver must:

- Be at least 21 years old and hold a valid driver's license of the correct class for the vehicle, held for at least two years
- Have an acceptable driving record, verified by a motor vehicle record check before authorization and at least annually thereafter
- Complete driver safety training, including defensive driving, passenger assistance, and the emergency procedures in this policy
- Report any license suspension, revocation, moving violation, or accident to the {{roles.hr.title}} within 24 hours

The {{roles.hr.title}} keeps a list of authorized drivers and removes driving authorization when a driver no longer meets these qualifications. Drivers do not use mobile phones while driving, except hands-free for emergencies, and never drive while impaired by alcohol, drugs, medication, or fatigue.

### Insurance

Agency vehicles carry commercial automobile liability coverage at or above the limits required by the agency's insurer, funders, and state rules. Personnel who use personal vehicles to transport persons served provide proof of current insurance at authorization and on each renewal, and the agency maintains non-owned auto coverage. The {{roles.finance.title}} keeps copies of insurance documents.

### Vehicle Inspection and Maintenance

Drivers complete a pre-trip inspection of each agency vehicle, checking tires, lights, brakes, mirrors, wipers, fluid leaks, seat belts, and safety equipment. Any defect that affects safety takes the vehicle out of service until it is repaired. Agency vehicles receive preventive maintenance according to the manufacturer's schedule, and inspection and maintenance records are kept for each vehicle. Personal vehicles used to transport persons served are in safe operating condition with current registration.

### Safety Equipment and Emergencies

Each agency vehicle carries a first aid kit, a fire extinguisher, reflective triangles or flares, a flashlight, a seat belt cutter, emergency contact information, and emergency information for the persons being transported. Drivers carry a charged phone.

In an emergency, the driver pulls over safely, turns on hazard lights, calls 911 if anyone is hurt or in danger, provides first aid within their training, and contacts the supervisor. During a medical or behavioral emergency in a moving vehicle, the driver stops the vehicle in a safe place before intervening.

### Passenger Safety and Supervision

- All passengers wear seat belts, and wheelchairs and other mobility devices are secured with approved restraint systems.
- {{#if program.servesMinors}}Children ride in age- and size-appropriate child safety seats as required by state law, and no child is left unattended in a vehicle.{{else}}No person served who needs supervision is left unattended in a vehicle.{{/if}}
- The person's plan identifies any additional supervision, seating, or behavioral support needs, and a second personnel member rides along when the plan calls for it.
- Drivers count and confirm passengers at pickup and drop-off and do not leave any person served until they are received by an appropriate person or safely at their destination.

### Accidents

After any vehicle accident, the driver ensures everyone's safety, calls 911 when anyone is injured or as required by law, notifies the supervisor, exchanges information with other parties, and does not admit fault. The driver completes an incident report the same day, and the accident is reviewed as a critical incident. Any person served involved in an accident is checked for injury and their guardian or emergency contact is notified.

## Responsibilities

- The {{roles.hr.title}} verifies driver qualifications and maintains the authorized driver list.
- The {{roles.safety.title}} oversees vehicle inspections, maintenance records, and accident review.
- Drivers follow this policy on every trip.

## Related Documents

- Critical Incidents
- Emergency Procedures
- Pre-trip inspection checklist and vehicle maintenance log
`,
};
