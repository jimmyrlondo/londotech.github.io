// Registry for the program batch. Import each policy and add it to the array.

import programStructure from './policies/program-structure.js';
import screeningAccess from './policies/screening-access.js';
import assessment from './policies/assessment.js';
import personCenteredPlan from './policies/person-centered-plan.js';
import transitionDischarge from './policies/transition-discharge.js';
import medicationManagement from './policies/medication-management.js';
import nonviolentPractices from './policies/nonviolent-practices.js';
import recordsOfPersonsServed from './policies/records-of-persons-served.js';
import qualityRecordsReview from './policies/quality-records-review.js';
import confidentialityRelease from './policies/confidentiality-release.js';
import telehealthServices from './policies/telehealth-services.js';

export default [
  programStructure,
  screeningAccess,
  assessment,
  personCenteredPlan,
  transitionDischarge,
  medicationManagement,
  nonviolentPractices,
  recordsOfPersonsServed,
  qualityRecordsReview,
  confidentialityRelease,
  telehealthServices,
];
