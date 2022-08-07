import { MongoClient } from 'mongodb';

export const insertToMongoCollection = async (
  dbName: string,
  collectionName: string,
  data: any
) => {
  const mongoClient = new MongoClient(process.env.MONGO_URI || '');
  try {
    const db = mongoClient.db(dbName);
    const collection = db.collection(collectionName);

    await collection.insertOne(data);
  } catch {
    console.error(`error inserting to mongo ${data.fileKey}`);
  } finally {
    await mongoClient.close();
  }
}

export const updateMongoCollection = async (
  dbName: string,
  collectionName: string,
  filter: any,
  updateData: any
) => {
  const mongoClient = new MongoClient(process.env.MONGO_URI || '');
  try {
    const db = mongoClient.db(dbName);
    const collection = db.collection(collectionName);

    await collection.updateOne(filter, updateData);
  } catch {
    console.error(`error updating mongo _id: ${id}`);
  } finally {
    await mongoClient.close();
  }
}