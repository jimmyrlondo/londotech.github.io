export default {
  id: 'health-safety',
  number: '1.12',
  section: 'ASPIRE',
  standard: '1.H',
  topic: 'Health and Safety',
  title: 'Health and Safety',
  manuals: ['*'],
  appliesIf: '',
  standardsYear: 2026,
  crosswalk: [
    { standard: '1.H', topic: 'Healthy and safe environment', heading: 'Policy' },
    { standard: '1.H', topic: 'Competency-based health and safety training', heading: 'Health and Safety Training' },
    { standard: '1.H', topic: 'Infection control', heading: 'Infection Control Program' },
    { standard: '1.H', topic: 'Health and safety self-inspections', heading: 'Self-Inspections' },
    { standard: '1.H', topic: 'First aid and emergency information on persons served', heading: 'First Aid Supplies and Emergency Information' },
    { standard: '1.H', topic: 'Hazardous materials', heading: 'Hazardous Materials' },
  ],
  consultantNotes: 'Section 1.H lettering and internal numbering may shift between manual years; verify the crosswalk against the current ASPIRE section. Confirm the self-inspection frequency (semiannual is the CARF minimum; some state licensing rules require quarterly or monthly inspections for residential sites). Confirm whether the state requires a specific first aid/CPR certification vendor or renewal cycle for direct support personnel. Confirm the infection control content reflects current state health department guidance and any OSHA bloodborne pathogens exposure control plan obligations. If the agency uses an external inspector (insurer, fire marshal) in addition to self-inspections, add that here. The 30-day corrective action timeframe is a recommended default.',
  body: `
## Purpose

{{agency.name}} maintains a healthy and safe environment for persons served, personnel, and visitors at every location and wherever services are delivered. This policy describes how the organization prevents injury and illness, trains personnel in safety competencies, inspects its locations, and responds to hazards.

## Scope

This policy applies to all personnel (employees{{#if ops.contractors}}, contracted service providers{{/if}}{{#if ops.volunteers}}, volunteers{{/if}}{{#if ops.students}}, students and interns{{/if}}) and to every location operated by {{agency.name}}, as well as community{{#if program.residential}}, residential,{{/if}} and other settings where personnel deliver services.

## Policy

{{agency.name}} treats health and safety as a shared responsibility. The {{roles.safety.title}} coordinates the health and safety program, and every supervisor is responsible for safe conditions in the areas and services they oversee. Personnel are expected to identify and report unsafe conditions immediately and are never disciplined or retaliated against for raising a safety concern in good faith.

The organization keeps its locations clean, sanitary, well lit, adequately ventilated, free of clutter and trip hazards, and in good repair. Exits are clearly marked and kept unobstructed, and fire extinguishers, smoke detectors, and other life safety equipment are inspected and maintained according to manufacturer and fire code requirements.

## Procedures

### Health and Safety Training

All personnel receive competency-based health and safety training during orientation, before working independently with persons served, and at least annually thereafter. Training includes:

- Safety procedures and safe work practices for the personnel member's role
- Emergency procedures, including evacuation routes and the location of emergency equipment
- Identification of unsafe environmental factors and how to report them
- Infection control, including hand hygiene, standard precautions, and use of personal protective equipment
- Reporting of critical incidents, as described in the Critical Incidents policy
{{#if ops.medsAny}}- Medication management appropriate to the personnel member's duties, as described in the agency's medication policies
{{/if}}{{#if ops.usesRestraint}}- Prevention of and response to behavioral emergencies, including the agency's restrictions on the use of restraint
{{/if}}{{#if program.residential}}- Residential site safety, including overnight procedures, kitchen and fire safety, and water temperature checks
{{/if}}
Competency is demonstrated by observation, return demonstration, or a written test, not attendance alone. The {{roles.hr.title}} keeps training records in each personnel file, and supervisors do not schedule personnel for independent work until required training is complete.

### Infection Control Program

The {{roles.safety.title}} maintains a written infection control program that includes:

- Hand hygiene and standard precautions for all personnel
- Availability of soap, hand sanitizer, gloves, and other personal protective equipment at each location
- Cleaning and disinfection schedules for common areas, equipment, and {{#if ops.transportation}}vehicles{{else}}shared items{{/if}}
- Exclusion and return-to-work guidance for personnel who are ill
- Handling of sharps, blood, and other potentially infectious materials, and response to exposures
- Monitoring of communicable disease activity in the community and implementation of public health guidance, including heightened measures during outbreaks or pandemics

Suspected or confirmed communicable disease exposures that affect persons served or personnel are reported as critical incidents and to public health authorities when required.

### Self-Inspections

The {{roles.safety.title}}, or a trained designee, conducts a comprehensive health and safety self-inspection of each location at least semiannually. Each inspection uses a standard checklist covering exits and egress, fire safety equipment, electrical hazards, chemical storage, first aid supplies, accessibility, sanitation, and the condition of grounds and building systems.

1. The inspector completes a written report of each inspection, noting conditions found and any hazards.
2. Each identified hazard is assigned to a responsible position with a target completion date, generally no more than 30 days, or immediately when the hazard poses an imminent risk.
3. The {{roles.safety.title}} tracks corrective actions to completion and documents the date each item is resolved.
4. Inspection reports and corrective action logs are retained and summarized for leadership as part of the annual review of health and safety performance.

### First Aid Supplies and Emergency Information

Each location{{#if ops.transportation}} and each agency vehicle{{/if}} has a stocked first aid kit appropriate to its size and services, checked monthly and restocked after use. Personnel know where kits and other emergency supplies are kept.

Emergency information for each person served, including emergency contacts, known allergies, current medical conditions, {{#if ops.medsAny}}current medications, {{/if}}and any advance directives, is readily available to personnel who need it in an emergency, including when services are delivered away from an agency location. The information is kept current in {{ops.ehrSystem || "the electronic health record"}} and protected according to the agency's confidentiality policies.

### Hazardous Materials

Hazardous materials are kept to the minimum needed and stored in their original labeled containers, in locked or restricted areas away from persons served who may be at risk. Safety data sheets are available at each location for every hazardous product on site. Personnel are trained in safe handling, spill response, and disposal before using any hazardous material.

## Responsibilities

- The {{roles.safety.title}} coordinates the health and safety program, inspections, and the infection control program.
- The {{roles.hr.title}} tracks completion of health and safety training.
- Supervisors maintain safe conditions in their areas and ensure corrective actions are completed.
- The {{roles.executive.title}} provides resources for corrective actions and reviews health and safety performance at least annually.

## Related Documents

- Emergency Procedures
- Critical Incidents
- Self-inspection checklist and corrective action log
`,
};
