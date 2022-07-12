import {
  Entity,
  createDirectRelationship,
} from '@keystone-labs/integration-sdk-core';
import { RelationshipClass } from '@keystone-labs/data-model';

interface CreateRelationshipParams {
  _class?: RelationshipClass;
  from: Entity;
  to: Entity;
}

export function createRelationship({
  _class,
  from,
  to,
}: CreateRelationshipParams) {
  return createDirectRelationship({
    _class: _class || RelationshipClass.HAS,
    from,
    to,
  });
}
