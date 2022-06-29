import { Neo4jGraphStore } from './neo4jGraphStore';
import {
  iterateParsedGraphFiles,
  isDirectoryPresent,
} from '@keystone-labs/integration-sdk-runtime';

import fs from 'fs'
import { Parser } from 'json2csv'
import _ from 'lodash';
import path from 'path'
import { buildPropertyParameters } from './neo4jUtilities';

type UploadToNeo4jParams = {
  pathToData: string;
  neo4jUri?: string;
  neo4jUser?: string;
  neo4jPassword?: string;
  person: string;
  year: string
};

export async function uploadToNeo4j({
  pathToData,
  neo4jUri = process.env.NEO4J_URI,
  neo4jUser = process.env.NEO4J_USER,
  neo4jPassword = process.env.NEO4J_PASSWORD,
  person,
  year
}: UploadToNeo4jParams) {
  if (!neo4jUri || !neo4jUser || !neo4jPassword ||person === undefined || person === undefined) {
    throw new Error(
      'ERROR: must provide login information in function call or include NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD files in your .env file!',
    );
  }
  if (!isDirectoryPresent(pathToData)) {
    throw new Error('ERROR: graph directory does not exist!');
  }

  const entities:any = []
  const relationships:any = []

  const store = new Neo4jGraphStore({
    uri: neo4jUri,
    username: neo4jUser,
    password: neo4jPassword,
  });

  const addFSDataToMemory = async (parsedData:any) => {
    if (parsedData.entities) entities.push(...parsedData.entities)
    if (parsedData.relationships) relationships.push(...parsedData.relationships)
  }

  try {
    await iterateParsedGraphFiles(addFSDataToMemory, pathToData);

    const entitiesTypes = _.groupBy(entities, '_class')
    for (const eTypeKey of Object.keys(entitiesTypes)) {
      const eTypeArray = entitiesTypes[eTypeKey]

      const keys = {}
      if (eTypeArray.length !== 0) {
        Object.keys(eTypeArray[0]).forEach(k => {
          if (['_rawData', 'displayName', 'odataEtag'].includes(k)) return
          keys[k] = true
        })  
      }

      const json2csvParser = new Parser();
      const csv = json2csvParser.parse(eTypeArray.map(a => {
        const sanitizedEntity = buildPropertyParameters(a)
        return _.omit(sanitizedEntity, '_rawData', 'displayName', 'odataEtag')
      }));
      
      const filepath = path.resolve(process.cwd(), 'csv', `${eTypeKey}.csv`)
      fs.writeFileSync(filepath, csv)
      await store.addEntities([], eTypeKey, Object.keys(keys), person, year)
    }

    const relationshipTypes = _.groupBy(relationships, '_class')
    for (const rTypeKey of Object.keys(relationshipTypes)) {
      const rTypeArray = relationshipTypes[rTypeKey]

      const rFromType = _.groupBy(rTypeArray, 'fromType')    
      for (const rFromTypeKey of Object.keys(rFromType)) {
        const rFromTypeArray = rFromType[rFromTypeKey]
        
        const rToType = _.groupBy(rFromTypeArray, 'toType')
        for(const rToTypeKey of Object.keys(rToType)) {
          const rToTypeArray = rToType[rToTypeKey]

          const filepath = path.resolve(process.cwd(), 'csv', `${rTypeKey}_${rFromTypeKey}-${rToTypeKey}.csv`)

          const json2csvParser = new Parser();
          const csv = json2csvParser.parse(rToTypeArray.map(a => {
            const sanitizedRelationship = buildPropertyParameters(a)
            return sanitizedRelationship
          }));
      
          fs.writeFileSync(filepath, csv)
          await store.addRelationships(rToTypeArray, rTypeKey, person, year, rFromTypeKey, rToTypeKey)
        }  
      }
    }  

  } finally {
    await store.close();
  }
}

const retry = async (func: () => Promise<void>, times: number) => {
  try {
    await func()
  } catch(e) {
    if (times === 0) throw e
    console.log(`retry error times ${times - 1}`)
    await new Promise((resolve) => {
      const randSecs = getRandomNumber()
      const timeout = (3 + randSecs) * 1000
      setTimeout(resolve, timeout)
    })
    await retry(func, times - 1)
  }
}

const getRandomNumber = () => {
  // from 10 to 49
  return 10 + Math.floor(Math.random() * 40);
}
