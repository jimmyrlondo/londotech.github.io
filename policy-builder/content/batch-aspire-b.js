// Registry for the aspire-b batch. Import each policy and add it to the array.

import healthSafety from './policies/health-safety.js';
import emergencyProcedures from './policies/emergency-procedures.js';
import criticalIncidents from './policies/critical-incidents.js';
import transportation from './policies/transportation.js';
import workforceManagement from './policies/workforce-management.js';
import volunteersStudents from './policies/volunteers-students.js';
import technology from './policies/technology.js';
import rightsOfPersonsServed from './policies/rights-of-persons-served.js';
import grievances from './policies/grievances.js';
import abuseNeglect from './policies/abuse-neglect.js';
import accessibility from './policies/accessibility.js';
import performanceMeasurement from './policies/performance-measurement.js';
import performanceImprovement from './policies/performance-improvement.js';

export default [
  healthSafety,
  emergencyProcedures,
  criticalIncidents,
  transportation,
  workforceManagement,
  volunteersStudents,
  technology,
  rightsOfPersonsServed,
  grievances,
  abuseNeglect,
  accessibility,
  performanceMeasurement,
  performanceImprovement,
];
