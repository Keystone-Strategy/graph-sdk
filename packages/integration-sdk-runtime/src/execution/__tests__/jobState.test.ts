import {
  createStepJobState,
  DuplicateKeyTracker,
  TypeTracker,
  MemoryDataStore,
  CreateStepJobStateParams,
  TypeTrackerStepSummary,
} from '../jobState';
import { v4 as uuid } from 'uuid';
import { FileSystemGraphObjectStore } from '../../storage';
import { vol } from 'memfs';
import { Entity } from '@keystone-labs/integration-sdk-core';
import {
  createTestEntity,
  createTestRelationship,
  sleep,
} from '@jupiterone/integration-sdk-private-test-utils';
import {
  createQueuedStepGraphObjectDataUploader,
  CreateQueuedStepGraphObjectDataUploaderParams,
} from '../uploader';
import { FlushedGraphObjectData } from '../../storage/types';

jest.mock('fs');

function createInMemoryStepGraphObjectDataUploaderCollector(
  partial?: CreateQueuedStepGraphObjectDataUploaderParams,
) {
  const graphObjectDataCollection: FlushedGraphObjectData[] = [];

  const uploader = createQueuedStepGraphObjectDataUploader({
    stepId: uuid(),
    uploadConcurrency: 5,
    upload(graphObjectData) {
      graphObjectDataCollection.push(graphObjectData);
      return Promise.resolve();
    },
    ...partial,
  });

  return {
    uploader,
    graphObjectDataCollection,
  };
}

function getMockCreateStepJobStateParams(
  partial?: Partial<CreateStepJobStateParams>,
): CreateStepJobStateParams {
  return {
    stepId: uuid(),
    graphObjectStore: new FileSystemGraphObjectStore(),
    duplicateKeyTracker: new DuplicateKeyTracker(),
    typeTracker: new TypeTracker(),
    dataStore: new MemoryDataStore(),
    ...partial,
  };
}

function createTestStepJobState(params?: Partial<CreateStepJobStateParams>) {
  return createStepJobState(getMockCreateStepJobStateParams(params));
}

describe('#createStepJobState', () => {
  afterEach(() => {
    vol.reset();
  });

  test('should allow creating job state and adding a single entity with "addEntity"', async () => {
    const jobState = createTestStepJobState();
    const entity: Entity = {
      _type: 'a_entity',
      _class: 'A',
      _key: 'a',
    };

    const result = await jobState.addEntity(entity);
    expect(result).toBe(entity);
  });

  test('should allow creating job state and adding a multiple entities with "addEntities"', async () => {
    const jobState = createTestStepJobState();
    const entities: Entity[] = [
      {
        _type: 'a_entity',
        _class: 'A',
        _key: 'a',
      },
      {
        _type: 'a_entity2',
        _class: 'B',
        _key: 'b',
      },
    ];

    const result = await jobState.addEntities(entities);
    expect(result).toBe(entities);
  });
});

describe('#findEntity', () => {
  afterEach(() => {
    vol.reset();
  });

  test('should find entity by _key', async () => {
    const jobState = createTestStepJobState();
    const entity: Entity = {
      _type: 'a_entity',
      _class: 'A',
      _key: 'a',
    };

    await jobState.addEntity(entity);
    expect(await jobState.findEntity('a')).toStrictEqual(entity);
  });

  test('should find entity by _key with key normalization', async () => {
    const jobState = createTestStepJobState({
      duplicateKeyTracker: new DuplicateKeyTracker((_key) =>
        _key.toLowerCase(),
      ),
    });

    const entity: Entity = {
      _type: 'a_entity',
      _class: 'A',
      _key: 'INCONSISTENT-casing',
    };

    await jobState.addEntity(entity);
    expect(await jobState.findEntity('inconsistent-CASING')).toStrictEqual(
      entity,
    );
  });

  test('should return "null" if entity not found', async () => {
    const jobState = createTestStepJobState();
    expect(await jobState.findEntity('invalid-entity-key')).toEqual(null);
  });
});

describe('#hasKey', () => {
  afterEach(() => {
    vol.reset();
  });

  test('answers false when no entity or relationship added', async () => {
    const jobState = createTestStepJobState();
    expect(await jobState.hasKey('a')).toBeFalse();
  });

  test('answers true when entity added', async () => {
    const jobState = createTestStepJobState();
    await jobState.addEntity(createTestEntity({ _key: 'a' }));
    expect(await jobState.hasKey('a')).toBeTrue();
  });

  test('answers true when relationship added', async () => {
    const jobState = createTestStepJobState();
    await jobState.addRelationship(createTestRelationship({ _key: 'a' }));
    expect(await jobState.hasKey('a')).toBeTrue();
  });

  test('key normalization', async () => {
    const jobState = createTestStepJobState({
      duplicateKeyTracker: new DuplicateKeyTracker((_key) =>
        _key.toLowerCase(),
      ),
    });
    await jobState.addEntity(createTestEntity({ _key: 'A' }));
    expect(await jobState.hasKey('A')).toBeTrue();
    expect(await jobState.hasKey('a')).toBeTrue();
  });
});

describe('upload callbacks', () => {
  test('#addEntities should call uploader enqueue on flushed', async () => {
    const uploadCollector =
      createInMemoryStepGraphObjectDataUploaderCollector();
    const jobState = createTestStepJobState({
      graphObjectStore: new FileSystemGraphObjectStore({
        graphObjectBufferThreshold: 2,
      }),
      uploader: uploadCollector.uploader,
    });

    const e1 = createTestEntity();
    const e2 = createTestEntity();

    await jobState.addEntities([e1]);
    await jobState.addEntities([e2]);

    const expectedUploaded: FlushedGraphObjectData[] = [
      {
        entities: [e1, e2],
        relationships: [],
      },
    ];

    expect(uploadCollector.graphObjectDataCollection).toEqual(expectedUploaded);
  });

  test('#addRelationships should call uploader enqueue on flushed', async () => {
    const uploadCollector =
      createInMemoryStepGraphObjectDataUploaderCollector();
    const jobState = createTestStepJobState({
      graphObjectStore: new FileSystemGraphObjectStore({
        graphObjectBufferThreshold: 2,
      }),
      uploader: uploadCollector.uploader,
    });

    const r1 = createTestRelationship();
    const r2 = createTestRelationship();

    await jobState.addRelationships([r1]);
    await jobState.addRelationships([r2]);

    const expectedUploaded: FlushedGraphObjectData[] = [
      {
        entities: [],
        relationships: [r1, r2],
      },
    ];

    expect(uploadCollector.graphObjectDataCollection).toEqual(expectedUploaded);
  });

  test('#flush should call uploader enqueue for entities and relationships', async () => {
    const uploadCollector =
      createInMemoryStepGraphObjectDataUploaderCollector();
    const jobState = createTestStepJobState({
      graphObjectStore: new FileSystemGraphObjectStore({
        graphObjectBufferThreshold: 5,
      }),
      uploader: uploadCollector.uploader,
    });

    const r1 = createTestRelationship();
    const e1 = createTestEntity();

    await jobState.addRelationships([r1]);
    await jobState.addEntities([e1]);
    expect(uploadCollector.graphObjectDataCollection).toEqual([]);

    await jobState.flush();

    const expectedUploaded: FlushedGraphObjectData[] = [
      {
        entities: [e1],
        relationships: [],
      },
      {
        entities: [],
        relationships: [r1],
      },
    ];

    expect(uploadCollector.graphObjectDataCollection).toEqual(expectedUploaded);
  });

  test('#waitUntilUploadsComplete should resolve when all uploads completed', async () => {
    const graphObjectDataCollection: FlushedGraphObjectData[] = [];

    const uploader = createQueuedStepGraphObjectDataUploader({
      stepId: uuid(),
      uploadConcurrency: 5,
      async upload(graphObjectData) {
        await sleep(200);
        graphObjectDataCollection.push(graphObjectData);
        return Promise.resolve();
      },
    });

    const jobState = createTestStepJobState({
      graphObjectStore: new FileSystemGraphObjectStore({
        graphObjectBufferThreshold: 2,
      }),
      uploader,
    });

    const e1 = createTestEntity();
    const e2 = createTestEntity();

    await jobState.addEntities([e1]);
    await jobState.addEntities([e2]);

    if (!jobState.waitUntilUploadsComplete) {
      throw new Error(
        'Default job state should have "waitUntilUploadsComplete" function',
      );
    }

    expect(graphObjectDataCollection).toEqual([]);
    await jobState.waitUntilUploadsComplete();

    const expectedUploaded: FlushedGraphObjectData[] = [
      {
        entities: [e1, e2],
        relationships: [],
      },
    ];

    expect(graphObjectDataCollection).toEqual(expectedUploaded);
  });
});

describe('#getData/#setData/#deleteData', () => {
  afterEach(() => {
    vol.reset();
  });

  test('should allow returning data', async () => {
    const jobState = createTestStepJobState();
    const key = uuid();
    await jobState.setData(key, 'test');
    expect(await jobState.getData(key)).toEqual('test');
  });

  test('should return "undefined" when a key is not found', async () => {
    const jobState = createTestStepJobState();
    expect(await jobState.getData(uuid())).toEqual(undefined);
  });

  test('should return "undefined" when a key is deleted', async () => {
    const jobState = createTestStepJobState();
    const key = uuid();
    await jobState.setData(key, 'test');
    await jobState.deleteData(key);
    expect(await jobState.getData(key)).toEqual(undefined);
  });
});

describe('#TypeTracker', () => {
  describe('#getEncounteredTypesForStep', () => {
    test('should allow getting encountered graph object types by step', () => {
      const typeTracker = new TypeTracker();

      typeTracker.addStepGraphObjectType({
        stepId: 'a',
        _type: 'my_type_1',
        count: 1,
      });

      typeTracker.addStepGraphObjectType({
        stepId: 'b',
        _type: 'my_type_1',
        count: 1,
      });

      typeTracker.addStepGraphObjectType({
        stepId: 'a',
        _type: 'my_type_2',
        count: 1,
      });

      expect(typeTracker.getEncounteredTypesForStep('a')).toEqual([
        'my_type_1',
        'my_type_2',
      ]);
    });
  });

  describe('#getAllEncounteredTypes', () => {
    test('should allow getting all encountered graph object types', () => {
      const typeTracker = new TypeTracker();

      typeTracker.addStepGraphObjectType({
        stepId: 'a',
        _type: 'my_type_1',
        count: 1,
      });

      typeTracker.addStepGraphObjectType({
        stepId: 'b',
        _type: 'my_type_1',
        count: 1,
      });

      typeTracker.addStepGraphObjectType({
        stepId: 'b',
        _type: 'my_type_3',
        count: 1,
      });

      typeTracker.addStepGraphObjectType({
        stepId: 'a',
        _type: 'my_type_2',
        count: 1,
      });

      expect(typeTracker.getAllEncounteredTypes()).toEqual([
        'my_type_1',
        'my_type_2',
        'my_type_3',
      ]);
    });
  });

  describe('#getEncounteredTypesForStep', () => {
    test('should return empty array if step not found', () => {
      const typeTracker = new TypeTracker();
      expect(typeTracker.getEncounteredTypesForStep('a')).toEqual([]);
    });
  });

  describe('#summarizeStep', () => {
    test('should return empty summary when step does not exist', () => {
      const typeTracker = new TypeTracker();

      const expected: TypeTrackerStepSummary = {
        graphObjectTypeSummary: [],
      };

      expect(typeTracker.summarizeStep('a')).toEqual(expected);
    });

    test('should allow summarizing an individual step', () => {
      const typeTracker = new TypeTracker();

      typeTracker.addStepGraphObjectType({
        stepId: 'a',
        _type: 'my_type_1',
        count: 1,
      });

      typeTracker.addStepGraphObjectType({
        stepId: 'a',
        _type: 'my_type_1',
        count: 2,
      });

      typeTracker.addStepGraphObjectType({
        stepId: 'b',
        _type: 'my_type_1',
        count: 1,
      });

      typeTracker.addStepGraphObjectType({
        stepId: 'b',
        _type: 'my_type_3',
        count: 1,
      });

      typeTracker.addStepGraphObjectType({
        stepId: 'a',
        _type: 'my_type_2',
        count: 1,
      });

      const expected: TypeTrackerStepSummary = {
        graphObjectTypeSummary: [
          {
            _type: 'my_type_1',
            total: 3,
          },
          {
            _type: 'my_type_2',
            total: 1,
          },
        ],
      };

      expect(typeTracker.summarizeStep('a')).toEqual(expected);
    });
  });
});
