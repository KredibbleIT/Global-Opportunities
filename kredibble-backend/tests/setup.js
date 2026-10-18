import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { jest } from '@jest/globals';

let mongoServer;

jest.setTimeout(60000);

const MONGO_START_ATTEMPTS = 3;

/**
 * Starts this worker's in-memory MongoDB. Parallel Jest workers each pick a free
 * port and then start mongod on it, so two can pick the same one; the loser fails
 * with `Port "N" already in use` and its whole suite would time out (PR #131's CI).
 * Only that start-up race is retried; every other error is thrown as before.
 *
 * @returns {Promise<MongoMemoryServer>}
 */
const startMongoServer = async () => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await MongoMemoryServer.create({ instance: { launchTimeout: 30000 } });
    } catch (error) {
      const portTaken = /already in use/i.test(String(error?.message));
      if (!portTaken || attempt >= MONGO_START_ATTEMPTS) throw error;
    }
  }
};

beforeAll(async () => {
  mongoServer = await startMongoServer();
  const uri = mongoServer.getUri();
  
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  
  await mongoose.connect(uri);
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});
