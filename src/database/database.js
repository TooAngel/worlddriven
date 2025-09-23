import { MongoClient } from 'mongodb';
export { ObjectId } from 'mongodb';

const url = process.env.MONGO_URL || 'mongodb://localhost:27017/worlddriven';
const dbName = 'worlddriven';
export const client = new MongoClient(url);

/**
 * @typedef {object} User
 * @property {import("mongodb").ObjectId} [_id]
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
 * @property {import("mongodb").ObjectId} userId
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
client
  .connect()
  .then(() => {
    database.setDB(client.db(dbName));
    console.log('Connected to MongoDB:', dbName);
  })
  .catch(error => {
    console.error('Failed to connect to MongoDB:', error);
  });
