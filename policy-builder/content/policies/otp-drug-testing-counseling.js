export default {
  id: 'otp-drug-testing-counseling',
  number: '3.44',
  section: 'SPECIFIC',
  standard: 'OTP 2',
  topic: 'Opioid Treatment Program',
  title: 'OTP Drug Testing, Counseling, and Overdose Prevention',
  manuals: ['OTP'],
  appliesIf: 'program.otpPrograms contains "otp"',
  standardsYear: 2026,
  crosswalk: [
    { standard: 'OTP 2', topic: 'OTP: drug testing frequency', heading: 'Drug Testing Frequency' },
    { standard: 'OTP 2', topic: 'OTP: specimen collection', heading: 'Specimen Collection' },
    { standard: 'OTP 2', topic: 'OTP: therapeutic use of test results', heading: 'Using Results Therapeutically' },
    { standard: 'OTP 2', topic: 'OTP: counseling and recovery supports', heading: 'Counseling and Recovery Supports' },
    { standard: 'OTP 2', topic: 'OTP: overdose prevention and naloxone', heading: 'Overdose Prevention and Naloxone' },
  ],
  consultantNotes: 'CARF OTP manual numbering varies by year; "OTP 2" is a placeholder. Verify. VERIFY EVERY REGULATORY SPECIFIC against current 42 CFR 8.12(f) (2024 rule) and the SOTA: (1) federal rule requires an initial toxicology test at admission and at least 8 random tests per year for persons in comprehensive maintenance treatment, using testing methods approved by FDA and in accordance with current guidelines; confirm the state minimum (some states require monthly). (2) The 2024 rule requires counseling and psychoeducation to be offered but makes clear that refusal of counseling is not a basis to deny or discontinue medication; confirm. (3) Observed collection is not federally required; validity checks (temperature, adulterant tests, or oral fluid) are the less intrusive alternative and are preferred by SAMHSA guidance. (4) Toxicology test results should not by themselves be the basis for discharge or denial of take-homes. (5) Counseling frequency here (weekly for first 90 days, then at least monthly) is an example; set to state rule and payer requirements. Counselor credential requirements are state-specific. Fentanyl test strips are legal in most but not all states; confirm before distribution.',
  body: `
## Purpose

To describe how the opioid treatment program of {{agency.name}} uses drug testing as a clinical tool, offers counseling and recovery supports, and reduces the risk of overdose for every person served.

## Scope

This policy applies to all persons served in the OTP and to the practitioners, nurses, and counselors who serve them. Assessment and person-centered planning follow Policy 2.03 Assessment of Persons Served and Policy 2.04 Person-Centered Planning; this policy adds requirements specific to the OTP.

## Policy

Drug testing at {{agency.name}} supports treatment decisions and safety. It is not used to punish. Counseling and recovery supports are offered to every person served, and a person's choice not to take part in counseling is never by itself a reason to deny or stop medication.

## Procedures

### Drug Testing Frequency

Each person served receives a toxicology test at admission. During maintenance treatment, each person receives at least 8 random tests per year, or more often if required by state rule or when clinically indicated, such as during stabilization, before increasing take-home doses, or when there are signs of unsafe use. Testing panels include the prescribed medication, fentanyl, and other substances the {{roles.medical.title}} specifies based on local drug supply trends.

### Specimen Collection

Collection is done in a way that protects dignity while producing valid results. The program uses validity checks, such as temperature strips, adulterant testing, or oral fluid testing, instead of direct observation whenever possible. Direct observation of urine collection is used only when the practitioner documents a clinical reason, such as a recent tampered specimen, and is performed by a person of the gender the person served prefers. Specimens are labeled in the person's presence and handled under chain-of-custody procedures. Unexpected point-of-care results are confirmed by laboratory testing before they affect take-home decisions.

### Using Results Therapeutically

Results are reviewed with the person served promptly and openly. A positive result for an unprescribed substance, or the absence of the prescribed medication, leads to a conversation about what is happening, a review of the dose and plan, and added support, not automatic sanctions. Results are one factor in take-home decisions (see Policy 3.42 OTP Take-Home Medication) and are not, by themselves, a reason for discharge. Results are protected under 42 CFR Part 2.

### Counseling and Recovery Supports

Every person served is offered:

- Individual counseling with a qualified counselor, at least weekly during the first 90 days and at least monthly afterward, or more often as the person and counselor agree
- Group counseling and psychoeducation on OUD, medications, and recovery
- Screening and referral for co-occurring mental health conditions, infectious diseases (HIV, hepatitis B and C), primary care, and prenatal care
- Peer recovery support, and links to vocational, educational, housing, legal, and family services
- Information about mutual support groups, including groups that welcome people using medication

Counseling goals are written into the person-centered plan. When a person declines counseling, the counselor documents the offer, keeps the door open, and continues to offer it at each plan review.

### Overdose Prevention and Naloxone

At admission, before any take-home dose, after a return to use, and at discharge or transfer, the program:

1. Educates the person served, and family members when the person agrees, on overdose risk, including the higher risk after missed doses, loss of tolerance, and fentanyl in the drug supply.
2. Trains the person to recognize an overdose, call 911, and give naloxone.
3. Provides naloxone, or a prescription for it, and documents that it was provided.

Naloxone is kept in the dosing and counseling areas, and personnel are trained to use it.

## Responsibilities

The {{roles.medical.title}} sets testing panels and frequency. Counselors offer and document counseling and recovery supports. Nurses collect specimens and provide naloxone education. The {{roles.clinical.title}} monitors counseling access and testing practice.
`,
};
