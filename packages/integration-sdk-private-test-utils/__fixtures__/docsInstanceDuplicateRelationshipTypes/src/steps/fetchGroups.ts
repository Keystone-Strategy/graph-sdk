import noop from 'lodash/noop';
import { StepExecutionContext, Step } from '@keystone-labs/integration-sdk-core';
import { RelationshipClass } from '@keystone-labs/data-model';

const fetchAccountsStep: Step<StepExecutionContext> = {
  id: 'fetch-groups',
  name: 'Fetch Groups',
  entities: [],
  relationships: [
    {
      _type: 'the_root_has_my_account',
      _class: RelationshipClass.HAS,
      sourceType: 'the_root',
      targetType: 'my_account',
    },
  ],
  executionHandler: noop,
};

export default fetchAccountsStep;
