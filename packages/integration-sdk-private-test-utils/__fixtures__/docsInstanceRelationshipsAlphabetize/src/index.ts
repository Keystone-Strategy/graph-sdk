import fetchAccountsStep from './steps/fetchAccounts';
import {
  IntegrationInvocationConfig,
  IntegrationInstanceConfig,
} from '@keystone-labs/integration-sdk-core';

export const invocationConfig: IntegrationInvocationConfig<IntegrationInstanceConfig> =
  {
    instanceConfigFields: {},
    integrationSteps: [fetchAccountsStep],
  };
