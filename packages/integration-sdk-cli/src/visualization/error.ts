import { IntegrationError } from '@keystone-labs/integration-sdk-core';

export class IntegrationMissingCollectJSON extends IntegrationError {
  constructor(message: string) {
    super({
      code: 'MISSING_COLLECT_JSON',
      message,
    });
  }
}
