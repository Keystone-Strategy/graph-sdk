import {
  ExecutionHistory,
  IntegrationInstance,
  IntegrationLogger,
} from '@keystone-labs/integration-sdk-core';

export const LOCAL_INTEGRATION_INSTANCE: IntegrationInstance = {
  id: 'local-integration-instance',
  accountId: 'Your account',
  name: 'Local Integration',
  integrationDefinitionId: 'local-integration-definition',
  description: 'A generated integration instance for local execution',
  config: {},
};

export const LOCAL_EXECUTION_HISTORY: ExecutionHistory = {
  current: {
    startedOn: 0,
  },
};

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

export function createMockIntegrationLogger(
  overrides?: Partial<IntegrationLogger>,
) {
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => createMockIntegrationLogger(overrides),
    isHandledError: () => true,
    stepStart: noop,
    stepSuccess: noop,
    stepFailure: noop,
    synchronizationUploadStart: noop,
    synchronizationUploadEnd: noop,
    validationFailure: noop,
    publishMetric: noop,
    publishEvent: noop,
    publishErrorEvent: noop,
    ...overrides,
  } as IntegrationLogger;
}
