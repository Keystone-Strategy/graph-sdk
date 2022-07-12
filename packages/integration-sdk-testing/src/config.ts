import {
  IntegrationInstanceConfig,
  IntegrationInvocationConfig,
} from '@keystone-labs/integration-sdk-core';

export interface StepTestConfig<
  TInvocationConfig extends IntegrationInvocationConfig = IntegrationInvocationConfig,
  TInstanceConfig extends IntegrationInstanceConfig = IntegrationInstanceConfig,
> {
  stepId: string;
  invocationConfig: TInvocationConfig;
  instanceConfig: TInstanceConfig;
}
