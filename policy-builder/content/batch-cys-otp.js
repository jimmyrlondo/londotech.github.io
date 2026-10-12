// Registry for the cys-otp batch. Import each policy and add it to the array.

import intensiveFamilyBased from './policies/intensive-family-based.js';
import fosterCare from './policies/foster-care.js';
import earlyChildhoodDevelopment from './policies/early-childhood-development.js';
import otpAdmission from './policies/otp-admission.js';
import otpMedicationDosing from './policies/otp-medication-dosing.js';
import otpTakeHomeMedication from './policies/otp-take-home-medication.js';
import otpDiversionControl from './policies/otp-diversion-control.js';
import otpDrugTestingCounseling from './policies/otp-drug-testing-counseling.js';
import otpContinuity from './policies/otp-continuity.js';

export default [
  intensiveFamilyBased,
  fosterCare,
  earlyChildhoodDevelopment,
  otpAdmission,
  otpMedicationDosing,
  otpTakeHomeMedication,
  otpDiversionControl,
  otpDrugTestingCounseling,
  otpContinuity,
];
