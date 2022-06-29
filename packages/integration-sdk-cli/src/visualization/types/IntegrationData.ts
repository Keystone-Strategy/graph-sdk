import {
  Entity,
  ExplicitRelationship,
  MappedRelationship,
} from '@keystone-labs/integration-sdk-core';

export interface IntegrationData {
  entities: Entity[];
  relationships: ExplicitRelationship[];
  mappedRelationships: MappedRelationship[];
}
