export default {
  id: 'foster-care',
  number: '3.31',
  section: 'SPECIFIC',
  standard: 'CYS 3',
  topic: 'Foster Care / Therapeutic Foster Care',
  title: 'Foster Care and Therapeutic Foster Care',
  manuals: ['CYS'],
  appliesIf: 'program.cysPrograms contains "fosterCare"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'CYS 3', topic: 'Foster care: recruitment of foster parents', heading: 'Recruitment of Foster Parents' },
    { standard: 'CYS 3', topic: 'Foster care: home study and licensing', heading: 'Home Study and Licensing' },
    { standard: 'CYS 3', topic: 'Foster care: foster parent training and support', heading: 'Foster Parent Training and Support' },
    { standard: 'CYS 3', topic: 'Foster care: matching and placement agreements', heading: 'Matching and Placement' },
    { standard: 'CYS 3', topic: 'Foster care: caseworker contact', heading: 'Caseworker Contact' },
    { standard: 'CYS 3', topic: 'Foster care: family time with the birth family', heading: 'Family Time with the Birth Family' },
    { standard: 'CYS 3', topic: 'Therapeutic foster care', heading: 'Therapeutic Foster Care' },
    { standard: 'CYS 3', topic: 'Foster care: reunification and permanency', heading: 'Reunification and Permanency' },
  ],
  consultantNotes: 'CARF CYS program-specific standard letters change between manual years; "CYS 3" is a placeholder for the Foster Care / Therapeutic Foster Care program description. Verify. STATE-SPECIFIC and heavily regulated: the agency must hold a state child placing agency (or private child placing agency) license, and foster home certification, home study content, preservice and annual training hours, background checks (federal law requires fingerprint-based FBI checks and child abuse registry checks for prospective foster parents and adult household members), capacity limits, and caseworker visit frequency are set by state rule (in Ohio, OAC 5101:2-5 and 5101:2-7). Numbers used here to confirm: preservice training per state rule, annual in-service hours, contact within 24 hours after placement, at least monthly face-to-face caseworker visits with most in the foster home (federal Title IV-B expectation), a home visit within 7 days of placement, weekly contact for therapeutic foster care, 24/7 on-call, a 30-day placement review. Therapeutic foster care often has its own state certification (treatment foster care) and smaller capacity limits. Federal permanency hearing timelines (12 months) and the 15-of-22-months TPR rule are set by the custodial agency and court; the policy defers to them.',
  body: `
## Purpose

To describe how {{agency.name}} recruits, prepares, licenses, and supports foster families, and how it places and supports children and youth in foster care and therapeutic foster care so that each child is safe, cared for, and moving toward a permanent family.

## Scope

This policy applies to the foster care program of {{agency.name}}, to children and youth placed in its foster homes, to foster parents, and to the personnel who support them. Assessment, planning, records, and abuse reporting follow the general policies in Sections 1 and 2; this policy adds what is specific to foster care.

## Policy

{{agency.name}} operates its foster care program only under a current child placing agency license from {{compliance.licensingAgency || "the state licensing agency"}} and follows state foster care rules in addition to this policy. Children are placed with families who are prepared for their needs, close to their home community and school where possible, and with siblings whenever it is safe. The goal for every child is a safe, permanent family, with reunification as the first goal unless the custodial agency or court has set another.

## Procedures

### Recruitment of Foster Parents

The program recruits foster families that reflect the culture, language, and communities of the children in care, with targeted recruitment for teens, sibling groups, and children with intensive needs. Relatives and kin are considered first when a child is referred.

### Home Study and Licensing

Each prospective foster family completes a home study under state rules before any child is placed. The home study includes interviews with all household members, references, a home safety inspection, health statements, a review of financial stability, and fingerprint-based criminal and child abuse registry checks on every adult in the home. The program submits a recommendation to the state and does not place a child until the home holds a current license or certificate. Homes are reassessed at each renewal and after any significant change in the household.

### Foster Parent Training and Support

Foster parents complete preservice training required by the state before licensure and the required annual in-service training, which includes trauma-informed parenting, behavior support without physical discipline, medication handling, cultural and identity support, working with birth families, and mandated reporting. Foster parents have 24-hour access to on-call program personnel, respite care, and support groups.

### Matching and Placement

Before placement, the program shares all known information about the child that the foster family needs to provide safe care. Matching considers the child's needs, safety, siblings, school, culture, language, and the family's capacity. A written placement agreement, signed by the foster parents and the program, sets out roles, the child's needs, medical consent arrangements, contact with the birth family, and how to reach the caseworker. The caseworker contacts the family within 24 hours after placement and visits the home within 7 days.

### Caseworker Contact

Caseworkers visit each child face to face at least monthly, with most visits in the foster home, and speak with the child privately at each visit when age-appropriate. Visits assess safety, well-being, school, health care, and progress on the plan, and are documented in {{ops.ehrSystem || "the record"}}.

### Family Time with the Birth Family

Unless a court order or the custodial agency limits contact, children have regular visits and other contact with parents, siblings, and kin, as set in the case plan. The program arranges transportation and supervision when required and supports foster parents in mentoring birth parents.

### Therapeutic Foster Care

Where {{agency.name}} offers therapeutic foster care, children with serious emotional, behavioral, or medical needs may be placed in therapeutic foster homes. Therapeutic foster parents complete additional training, care for fewer children, and receive at least weekly contact from a treatment coordinator. Each child has an individualized treatment plan developed with the clinical team, and the {{roles.clinical.title}} reviews progress at least monthly.

### Reunification and Permanency

The program works with {{compliance.cpsAgency || "the public children services agency"}} and the court toward the permanency goal in the case plan, whether reunification, adoption, kinship guardianship, or another planned arrangement. It reports progress for case reviews and court hearings, prepares children and families for each transition, and helps older youth gain independent living skills. Unplanned placement disruptions are reviewed by the {{roles.clinical.title}} to prevent repeat moves.

## Responsibilities

The {{roles.clinical.title}} oversees licensing compliance, matching decisions, and disruption reviews. Caseworkers conduct visits and document contact. The {{roles.hr.title}} tracks foster parent training and background check renewals.
`,
};
