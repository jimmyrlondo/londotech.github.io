// Registry for the employment-aging batch. Import each policy and add it to the array.

import communityEmployment from './policies/community-employment.js';
import employeeDevelopment from './policies/employee-development.js';
import vocationalEvaluation from './policies/vocational-evaluation.js';
import adultDayServices from './policies/adult-day-services.js';
import homeCommunityServices from './policies/home-community-services.js';
import personCenteredLongTermCare from './policies/person-centered-long-term-care.js';

export default [
  communityEmployment,
  employeeDevelopment,
  vocationalEvaluation,
  adultDayServices,
  homeCommunityServices,
  personCenteredLongTermCare,
];
