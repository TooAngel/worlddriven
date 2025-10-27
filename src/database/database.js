import { MongoClient } from 'mongodb';
export { ObjectId } from 'mongodb';

const url = process.env.MONGO_URL || 'mongodb://localhost:27017/worlddriven';
const dbName = 'worlddriven';
export const client = new MongoClient(url);

/**
 * @typedef {object} User
 * @property {import("mongodb").ObjectId} [_id]
 * @property {number} githubUserId - GitHub user ID (stable identifier)
 * @property {string} githubAccessToken
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

/**
 * @typedef {object} Repository
 * @property {import("mongodb").ObjectId} [_id]
 * @property {string} owner
 * @property {string} repo
 * @property {boolean} configured
 * @property {number} [installationId] - GitHub App installation ID (required for repository operations)
 * @property {import("mongodb").ObjectId} [userId] - DEPRECATED: Removed as of 2025-10-11, use installationId instead
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

/**
 * @typedef {object} DatabaseConnection
 * @property {mongo.Collection<User>} users
 * @property {mongo.Collection<Repository>} repositories
 */

/**
 * @type {DatabaseConnection}
 */
class Database {
  /** @type {import('mongodb').Db | undefined} */
  db;

  /**
   * @param {import('mongodb').Db} db
   */
  setDB(db) {
    this.db = db;
  }

  /**
   * @template {import("mongodb").Document} T
   * @param {string} name
   * @return {import("mongodb").Collection<T>}
   */
  getCollection(name) {
    if (!this.db) {
      throw new Error(`Database connection not established`);
    }
    return /** @type {import("mongodb").Collection<T>} */ (
      /** @type {unknown} */ (this.db.collection(name))
    );
  }

  /**
   * @return {mongo.Collection<User>}
   */
  get users() {
    return this.getCollection('users');
  }

  /**
   * @return {mongo.Collection<Repository>}
   */
  get repositories() {
    return this.getCollection('repositories');
  }
}

export const database = new Database();

// Export connection promise for migrations to await
export const connectionPromise = client
  .connect()
  .then(() => {
    database.setDB(client.db(dbName));
    console.log('Connected to MongoDB:', dbName);
    return database;
  })
  .catch(error => {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  });
