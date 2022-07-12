import {
  createIntegrationEntity,
  IntegrationStepExecutionContext,
  StepExecutionContext,
  Step,
} from '@keystone-labs/integration-sdk-core';

const fetchAccountsStep: Step<StepExecutionContext> = {
  id: 'fetch-accounts',
  name: 'Fetch Accounts',
  entities: [
    {
      resourceName: 'The Account',
      _type: 'my_account',
      _class: 'Account',
    },
  ],
  relationships: [],
  executionHandler: async ({
    jobState,
  }: IntegrationStepExecutionContext<{}>) => {
    await jobState.addEntities([
      createIntegrationEntity({
        entityData: {
          source: {
            id: '1234',
            name: 'Account 1234',
            description: 'Account 1234',
          },
          assign: {
            _key: 'account:1234',
            _type: 'my_account',
            _class: 'Account',
          },
        },
      }),
    ]);
  },
};

export default fetchAccountsStep;
