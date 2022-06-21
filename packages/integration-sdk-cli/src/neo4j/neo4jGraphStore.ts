import { Entity, Relationship } from '@jupiterone/integration-sdk-core';

import * as neo4j from 'neo4j-driver';

// https://neo4j.com/docs/java-reference/current/transaction-management/#transactions-deadlocks
export interface Neo4jGraphObjectStoreParams {
  uri: string;
  username: string;
  password: string;
  session?: neo4j.Session;
}

export class Neo4jGraphStore {
  private neo4jDriver: neo4j.Driver;
  private persistedSession: neo4j.Session;
  private databaseName = 'neo4j';

  constructor(params: Neo4jGraphObjectStoreParams) {
    this.neo4jDriver = neo4j.driver(
        params.uri,
        neo4j.auth.basic(params.username, params.password),
      );
    this.persistedSession = this.neo4jDriver.session({
      database: this.databaseName,
      defaultAccessMode: neo4j.session.WRITE,
    });
  }

  private async runCypherCommand(
    cypherCommand: string,
    cypherParameters?: any,
  ): Promise<neo4j.Result> {
    const result = await this.persistedSession.run(cypherCommand, cypherParameters);
    return result;
  }

  async addEntities(newEntities: Entity[], type: string, keys: string[], person: string, year: string) {
    const indexTsx = this.persistedSession.beginTransaction()
    await indexTsx.run(
      `CREATE INDEX index_${type} IF NOT EXISTS FOR (n:${type}) ON (n._key);`,
    );
    await indexTsx.commit()
    
    const keysCommand = keys.map((k) => {
      return ` ${k}: row.${k} `
    }).join(',')

    // const command = `
    //   USING PERIODIC COMMIT 10000
    //   LOAD CSV WITH HEADERS FROM "file:///csv/${person}/${year}/${type}.csv" AS row
    //   MERGE (n: ${type} { _key: row._key }) 
    //   SET n += { ${keysCommand} }
    // `
    const command = `
      CALL apoc.periodic.iterate(
      "
        CALL apoc.load.csv('file:///csv/${person}/${year}/${type}.csv', { header: true })
        YIELD map AS row RETURN row
      ",
      "
        MERGE (n:${type} { _key: row._key }) 
        SET n += { ${keysCommand} };
      ",
      { batchSize: 10000, parallel: true, retries: 10 }
      )
    `
    await this.persistedSession.run(command)

    console.log('done', 'node', type)
  }

  async addRelationships(newRelationships: Relationship[], type: string, person: string, year: string, fromType: string, toType: string) {
    const indexTsx = this.persistedSession.beginTransaction()
    await indexTsx.run(
      `CREATE INDEX index_${type} IF NOT EXISTS FOR ()-[r:${type}]-() ON (r._key);`,
    );
    await indexTsx.run(
      `CREATE INDEX index_${fromType} IF NOT EXISTS FOR (n:${fromType}) ON (n._key);`,
    );
    await indexTsx.run(
      `CREATE INDEX index_${toType} IF NOT EXISTS FOR (n:${toType}) ON (n._key);`,
    );
    await indexTsx.commit()

    // const command = `
    //   USING PERIODIC COMMIT 5000
    //   LOAD CSV WITH HEADERS FROM "file:///csv/${type}.csv" AS csvLine

    //   MATCH (start: csvLine.fromType { _key: csvLine._fromEntityKey })
    //   MATCH (end: csvLine.toType { _key: csvLine._toEntityKey })
    //   MERGE (start)-[:${type}]->(end);
    // `

    const command = `
      CALL apoc.periodic.iterate(
        "
          CALL apoc.load.csv('file:///csv/${person}/${year}/${type}_${fromType}-${toType}.csv', { header: true })
          YIELD map AS row RETURN row        
        ",
        "
          MERGE (start: ${fromType} { _key: row._fromEntityKey })
          MERGE (end: ${toType} { _key: row._toEntityKey })
          MERGE (start)-[:${type} { _key: row._key }]->(end);
        ",
        { batchSize: 10000, retries: 10 }
      )
    `
    await this.persistedSession.run(command)
    
    console.log('done', 'relationships', type, fromType, toType)
  }

  // TODO, if we get to very large databases we could reach a size where
  // one or both both of the below wipe commands can't be easily executed
  // in memory.  At that time, we should consider requiring/using the APOC
  // library so we can use apoc.periodic.iterate.  Leaving out for now,
  // since that would further complicate the Neo4j database setup.
  async wipeInstanceIdData() {
    const wipeCypherCommand = `MATCH (n) DETACH DELETE n`;
    await this.runCypherCommand(wipeCypherCommand);
  }

  async wipeDatabase() {
    const wipeCypherCommand = `MATCH (n) DETACH DELETE n`;
    await this.runCypherCommand(wipeCypherCommand);
  }

  async close() {
    await this.neo4jDriver.close();
  }
}
