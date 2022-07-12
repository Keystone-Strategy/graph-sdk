import pMap from 'p-map';

import S3 from 'aws-sdk/clients/s3';
import SQS from 'aws-sdk/clients/sqs';

import {
  Entity,
  GraphObjectFilter,
  GraphObjectIteratee,
  Relationship,
  GraphObjectStore,
  GraphObjectIndexMetadata,
  GetIndexMetadataForGraphObjectTypeParams,
  IntegrationStep,
} from '@keystone-labs/integration-sdk-core';

import {
  iterateEntityTypeIndex,
  iterateRelationshipTypeIndex,
} from './indices';
import { InMemoryGraphObjectStore } from '../memory';
import _ from 'lodash';
import { Parser } from 'json2csv';
import { buildPropertyParameters } from './neo4jUtilities';

const s3Client = new S3({ region: 'us-east-2' });
const sqsClient = new SQS({ region: 'us-east-2' });

export interface CloudServiceCSVGraphObjectStoreParams {
  integrationSteps?: IntegrationStep[];
}

interface GraphObjectIndexMetadataMap {
  /**
   * Map of _type to GraphObjectIndexMetadata
   */
  entities: Map<string, GraphObjectIndexMetadata>;
  /**
   * Map of _type to GraphObjectIndexMetadata
   */
  relationships: Map<string, GraphObjectIndexMetadata>;
}

/**
 * TODO: Write this comment to explain why the thing is the way it is
 */
function integrationStepsToGraphObjectIndexMetadataMap(
  integrationSteps: IntegrationStep[],
): Map<string, GraphObjectIndexMetadataMap> {
  const stepIdToGraphObjectIndexMetadataMap = new Map<
    string,
    GraphObjectIndexMetadataMap
  >();

  for (const step of integrationSteps) {
    const metadataMap: GraphObjectIndexMetadataMap = {
      entities: new Map(),
      relationships: new Map(),
    };

    for (const entityMetadata of step.entities) {
      if (entityMetadata.indexMetadata) {
        metadataMap.entities.set(
          entityMetadata._type,
          entityMetadata.indexMetadata,
        );
      }
    }

    for (const relationshipMetadata of step.relationships) {
      if (relationshipMetadata.indexMetadata) {
        metadataMap.relationships.set(
          relationshipMetadata._type,
          relationshipMetadata.indexMetadata,
        );
      }
    }

    stepIdToGraphObjectIndexMetadataMap.set(step.id, metadataMap);
  }

  return stepIdToGraphObjectIndexMetadataMap;
}

export class CloudServiceCSVGraphObjectStore implements GraphObjectStore {
  private readonly localGraphObjectStore = new InMemoryGraphObjectStore();
  private readonly stepIdToGraphObjectIndexMetadataMap: Map<
    string,
    GraphObjectIndexMetadataMap
  >;
  private readonly uniqueIdentifier = String(_.random(1, 99999)).padStart(
    5,
    '0',
  );

  constructor(params?: CloudServiceCSVGraphObjectStoreParams) {
    if (params?.integrationSteps) {
      this.stepIdToGraphObjectIndexMetadataMap =
        integrationStepsToGraphObjectIndexMetadataMap(params.integrationSteps);
    }
  }

  async addEntities(stepId: string, newEntities: Entity[]) {
    await this.localGraphObjectStore.addEntities(stepId, newEntities);
  }

  async addRelationships(stepId: string, newRelationships: Relationship[]) {
    await this.localGraphObjectStore.addRelationships(stepId, newRelationships);
  }

  /**
   * The FileSystemGraphObjectStore first checks to see if the entity exists
   * in the InMemoryGraphObjectStore. If not, it then checks to see if it is
   * located on disk.
   */
  async findEntity(_key: string | undefined): Promise<Entity | undefined> {
    if (!_key) return;
    const bufferedEntity = await this.localGraphObjectStore.findEntity(_key);
    return bufferedEntity;
  }

  async iterateEntities<T extends Entity = Entity>(
    filter: GraphObjectFilter,
    iteratee: GraphObjectIteratee<T>,
  ) {
    await this.localGraphObjectStore.iterateEntities(filter, iteratee);

    await iterateEntityTypeIndex({
      type: filter._type,
      iteratee,
    });
  }

  async iterateRelationships<T extends Relationship = Relationship>(
    filter: GraphObjectFilter,
    iteratee: GraphObjectIteratee<T>,
  ) {
    await this.localGraphObjectStore.iterateRelationships(filter, iteratee);

    await iterateRelationshipTypeIndex({
      type: filter._type,
      iteratee,
    });
  }

  async flush(
    onEntitiesFlushed?: (entities: Entity[]) => Promise<void>,
    onRelationshipsFlushed?: (relationships: Relationship[]) => Promise<void>,
  ) {
    await this.flushEntitiesToDisk(onEntitiesFlushed);
    await this.flushRelationshipsToDisk(onRelationshipsFlushed);
  }

  async flushEntitiesToDisk(
    onEntitiesFlushed?: (entities: Entity[]) => Promise<void>,
  ) {
    pMap(
      this.localGraphObjectStore.collectEntitiesByStep(),
      async ([stepId, entities]) => {
        console.log('flushEntitiesToDisk', stepId);
        const entitiesTypes = _.groupBy(entities, '_type');
        for (const eTypeKey of Object.keys(entitiesTypes)) {
          const eTypeArray = entitiesTypes[eTypeKey];

          const json2csvParser = new Parser();
          const csv = json2csvParser.parse(
            eTypeArray.map((a) => {
              return buildPropertyParameters(a);
            }),
          );

          const buf = Buffer.from(csv, 'utf8');

          const fileKey = `collect/${this.uniqueIdentifier}-${stepId}-ENTITY-${eTypeKey}.csv`;
          const r = await s3Client
            .putObject({
              Bucket: process.env.S3_BUCKET || '',
              Key: fileKey,
              Body: buf,
            })
            .promise();

          const eTag = r.ETag;
          if (!eTag) throw new Error('no etag');

          await sqsClient
            .sendMessage({
              QueueUrl: process.env.SQS_QUEUE_URL || '',
              MessageBody: eTag,
              MessageAttributes: {
                type: {
                  DataType: 'String',
                  StringValue: 'ENTITY',
                },
                entityType: {
                  DataType: 'String',
                  StringValue: eTypeKey,
                },
                fileKey: {
                  DataType: 'String',
                  StringValue: fileKey,
                },
              },
            })
            .promise();
        }

        this.localGraphObjectStore.flushEntities(entities);
        if (onEntitiesFlushed) await onEntitiesFlushed(entities);
      },
    );
  }

  async flushRelationshipsToDisk(
    onRelationshipsFlushed?: (relationships: Relationship[]) => Promise<void>,
  ) {
    pMap(
      this.localGraphObjectStore.collectRelationshipsByStep(),
      async ([stepId, relationships]) => {
        const relationshipTypes = _.groupBy(relationships, '_type');
        for (const rTypeKey of Object.keys(relationshipTypes)) {
          const rTypeArray = relationshipTypes[rTypeKey];

          const rFromType = _.groupBy(rTypeArray, 'fromType');
          for (const rFromTypeKey of Object.keys(rFromType)) {
            const rFromTypeArray = rFromType[rFromTypeKey];

            const rToType = _.groupBy(rFromTypeArray, 'toType');
            for (const rToTypeKey of Object.keys(rToType)) {
              const rToTypeArray = rToType[rToTypeKey];

              const json2csvParser = new Parser();
              const csv = json2csvParser.parse(
                rToTypeArray.map((a) => {
                  const sanitizedRelationship = buildPropertyParameters(a);
                  return sanitizedRelationship;
                }),
              );

              const buf = Buffer.from(csv, 'utf8');

              const fileKey = `collect/${this.uniqueIdentifier}-${stepId}-RELATIONSHIP-${rTypeKey}-${rFromTypeKey}-${rToTypeKey}.csv`;
              const r = await s3Client
                .putObject({
                  Bucket: process.env.S3_BUCKET || '',
                  Key: fileKey,
                  Body: buf,
                })
                .promise();

              const eTag = r.ETag;
              if (!eTag) throw new Error('no etag');

              await sqsClient
                .sendMessage({
                  QueueUrl: process.env.SQS_QUEUE_URL || '',
                  MessageBody: eTag,
                  MessageAttributes: {
                    type: {
                      DataType: 'String',
                      StringValue: 'RELATIONSHIP',
                    },
                    relationshipType: {
                      DataType: 'String',
                      StringValue: rTypeKey,
                    },
                    fromEntityType: {
                      DataType: 'String',
                      StringValue: rFromTypeKey,
                    },
                    toEntityType: {
                      DataType: 'String',
                      StringValue: rToTypeKey,
                    },
                    fileKey: {
                      DataType: 'String',
                      StringValue: fileKey,
                    },
                  },
                })
                .promise();
            }
          }
        }
        this.localGraphObjectStore.flushRelationships(relationships);
        if (onRelationshipsFlushed) {
          await onRelationshipsFlushed(relationships);
        }
      },
    );
  }

  getIndexMetadataForGraphObjectType({
    stepId,
    _type,
    graphObjectCollectionType,
  }: GetIndexMetadataForGraphObjectTypeParams):
    | GraphObjectIndexMetadata
    | undefined {
    if (!this.stepIdToGraphObjectIndexMetadataMap) {
      return undefined;
    }

    const map = this.stepIdToGraphObjectIndexMetadataMap.get(stepId);
    return map && map[graphObjectCollectionType].get(_type);
  }
}
