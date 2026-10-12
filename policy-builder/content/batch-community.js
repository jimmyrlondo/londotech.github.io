// Registry for the community batch. Import each policy and add it to the array.

import caseManagement from './policies/case-management.js';
import assertiveCommunityTreatment from './policies/assertive-community-treatment.js';
import communityIntegration from './policies/community-integration.js';
import supportedLiving from './policies/supported-living.js';
import communityHousing from './policies/community-housing.js';
import hostFamilySharedLiving from './policies/host-family-shared-living.js';
import personalSupports from './policies/personal-supports.js';
import respiteServices from './policies/respite-services.js';
import preventionServices from './policies/prevention-services.js';

export default [
  caseManagement,
  assertiveCommunityTreatment,
  communityIntegration,
  supportedLiving,
  communityHousing,
  hostFamilySharedLiving,
  personalSupports,
  respiteServices,
  preventionServices,
];
