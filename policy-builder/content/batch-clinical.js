// Registry for the clinical batch. Import each policy and add it to the array.

import outpatientTreatment from './policies/outpatient-treatment.js';
import intensiveOutpatient from './policies/intensive-outpatient.js';
import partialHospitalization from './policies/partial-hospitalization.js';
import dayTreatment from './policies/day-treatment.js';
import crisisIntervention from './policies/crisis-intervention.js';
import crisisStabilization from './policies/crisis-stabilization.js';
import residentialTreatment from './policies/residential-treatment.js';
import withdrawalManagement from './policies/withdrawal-management.js';

export default [
  outpatientTreatment,
  intensiveOutpatient,
  partialHospitalization,
  dayTreatment,
  crisisIntervention,
  crisisStabilization,
  residentialTreatment,
  withdrawalManagement,
];
