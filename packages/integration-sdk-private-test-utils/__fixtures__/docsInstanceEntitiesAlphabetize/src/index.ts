import fetchDataSteps from './steps/fetchData';
import {
  IntegrationInvocationConfig,
  IntegrationInstanceConfig,
} from '@keystone-labs/integration-sdk-core';

export const invocationConfig: IntegrationInvocationConfig<IntegrationInstanceConfig> =
  {
    instanceConfigFields: {},
    integrationSteps: [fetchDataSteps],
  };
