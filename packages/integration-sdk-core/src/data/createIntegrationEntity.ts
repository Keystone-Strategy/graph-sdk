import {
  getSchema,
  IntegrationEntitySchema,
  validateEntityWithSchema,
} from '@keystone-labs/data-model';

import { IntegrationError } from '../errors';
import { Entity } from '../types';
import { parseTimePropertyValue } from './converters';
import { assignTags, ResourceTagList, ResourceTagMap } from './tagging';

const SUPPORTED_TYPES = ['string', 'number', 'boolean'];

/**
 * Properties to be assigned to a generated entity which are declared in code
 * literals.
 *
 * Many values can be transferred from the `ProviderSourceData` without any
 * additional effort. Other properties must transferred by using code to specify
 * the property value. These properties can be any name/value, but the list
 * certainly includes those of `Entity`, and some properties
 * *must* be provided.
 */
type LiteralAssignments = Entity;

/**
 * A type representing entity data from a provider.
 */
type ProviderSourceData = {
  /**
   * Some providers include a collection of `tags` that will be stored on the
   * generated entity as `tag.propertyName`, `propertyName` when the tag is
   * registered in `tagProperties` or is known to be a common tag property name,
   * and the tag values will be collected in the generated entity as `tags` (a
   * `string[]`);
   */
  tags?: ResourceTagList | ResourceTagMap;

  [key: string]: any;
};

/**
 * Data used to generate an `Entity`.
 */
export type IntegrationEntityData = {
  /**
   * Data from a provider API that will be selectively transferred to an
   * `Entity`.
   *
   * The common properties defined by data model schemas, selected by the
   * `assign._class`, will be found and transferred to the generated entity.
   */
  source: ProviderSourceData;

  /**
   * Literal property assignments. These values will override anything
   * transferred from the `source` data.
   */
  assign: LiteralAssignments;

  /**
   * The names of properties that will be assigned directly to the entity from
   * tags with matching names.
   *
   * @see assignTags
   */
  tagProperties?: string[];
};

/**
 * A generated `Entity` that includes additional properties
 * specific to the entity class and some properties are guaranteed.
 */
type GeneratedEntity = Entity

export type IntegrationEntityBuilderInput = {
  /**
   * Data used to generate an `Entity`.
   */
  entityData: IntegrationEntityData;

  // The plan is to allow another property that contains metadata to drive the
  // transfer process further, placing transformations that are common to the
  // integration in one place, and allowing transformation reuse across
  // integrations.
};

/**
 * Generates an `Entity` using the provided `entityData`.
 *
 * WARNING: This is a work in progress. Only certain schemas are supported as
 * the API is worked out in the Azure integration.
 */
export function createIntegrationEntity(
  input: IntegrationEntityBuilderInput,
): GeneratedEntity {
  const generatedEntity = generateEntity(input.entityData);

  if (process.env.ENABLE_GRAPH_OBJECT_SCHEMA_VALIDATION) {
    validateEntityWithSchema(generatedEntity);
  }

  return generatedEntity;
}

function generateEntity({
  source,
  assign,
  tagProperties,
}: IntegrationEntityData): GeneratedEntity {
  const entity: GeneratedEntity = {
    ...whitelistedProviderData(source, assign._type),
    ...assign,
    _type: assign._type,
  };

  if (entity.createdOn === undefined) {
    entity.createdOn =
      (source.createdAt && parseTimePropertyValue(source.createdAt)) ||
      (source.creationDate && parseTimePropertyValue(source.creationDate)) ||
      (source.creationTime && parseTimePropertyValue(source.creationTime)) ||
      (source.creationTimestamp &&
        parseTimePropertyValue(source.creationTimestamp));
  }

  if (entity.active === undefined && source.status) {
    const isActive = new RegExp('(?<!in)active|enabled|online', 'i').test(
      source.status,
    );
    const isInactive = new RegExp('inactive|disabled|offline', 'i').test(
      source.status,
    );

    entity.active = isActive
      ? true // if
      : isInactive
      ? false // else if
      : undefined; // else
  }

  // Remove transferred `source.tags` property from the entity. `tags` is in the
  // schema white list, but the structure isn't what we want `tags` to be.
  // `assignTags` will take care of preparing `tags` properly.
  delete entity.tags;

  assignTags(entity, source.tags, tagProperties);

  return entity;
}

/**
 * Answers a form of the provider data with only the properties supported by the
 * data model schema.
 *
 * @param source resource data from the resource provider/external system
 * @param _class entity `_class: string[]` value
 */
function whitelistedProviderData(
  source: ProviderSourceData,
  _type: string,
): Omit<ProviderSourceData, 'tags'> {
  const whitelistedProviderData: ProviderSourceData = {};
  const schemaProperties = schemaWhitelistedPropertyNames(_type);
  for (const [key, value] of Object.entries(source)) {
    if (value != null && schemaProperties.includes(key)) {
      const valueType = Array.isArray(value) ? typeof value[0] : typeof value;
      if (SUPPORTED_TYPES.includes(valueType)) {
        whitelistedProviderData[key] = value;
      }
    }
  }
  return whitelistedProviderData;
}

/**
 * The whitelisted property names for unique combinations of `_class: Array`
 * values seen so far in the program.
 */
export const schemaWhitelists = new Map<string, string[]>();

/**
 * Answers all the property names defined by the schemas referenced in the set
 * of classes. Values are cached to avoid rebuilding, since there could be
 * thousands of entities constructed during a single execution.
 */
export function schemaWhitelistedPropertyNames(_type: string): string[] {
  let properties = schemaWhitelists.get(_type);
  if (!properties) {
    properties = [];

      const schema = getSchema(_type);
      if (!schema) {
        throw new IntegrationError({
          code: 'NO_SCHEMA_FOR_TYPE',
          message: `Type '${_type}' does not yet have a schema supported by the SDK!`,
        });
      }
      for (const name of schemaPropertyNames(schema)) {
        properties.push(name);
      }
    
    schemaWhitelists.set(_type, properties);
  }
  return properties;
}

function schemaPropertyNames(schema: IntegrationEntitySchema): string[] {
  const names: string[] = [];
  if (schema.properties) {
    names.push(...Object.keys(schema.properties));
  }
  if (schema.allOf) {
    for (const s of schema.allOf) {
      names.push(...schemaPropertyNames(s));
    }
  }
  if (schema.$ref) {
    const refSchema = getSchema(schema.$ref.slice(1));
    if (refSchema) {
      names.push(...schemaPropertyNames(refSchema));
    } else {
      throw new IntegrationError({
        code: 'CANNOT_RESOLVE_SCHEMA_REF',
        message: `Schema $ref '${schema.$ref}' cannot be resolved!`,
      });
    }
  }
  return names;
}
