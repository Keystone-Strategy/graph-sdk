import { IntegrationValidationError } from '@keystone-labs/integration-sdk-core';

export default function validateInvocation() {
  throw new IntegrationValidationError('Failed to access provider api');
}
