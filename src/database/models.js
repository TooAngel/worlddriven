import { database, ObjectId } from './database.js';

/**
 * User model functions
 */
export const User = {
  /**
   * Create a new user
   * @param {object} userData
   * @param {string} userData.githubAccessToken
   * @returns {Promise<import('./database.js').User>}
   */
  async create(userData) {
    const user = {
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await database.users.insertOne(user);
    return { ...user, _id: result.insertedId };
  },

  /**
   * Find user by ID
   * @param {string|ObjectId} id
   * @returns {Promise<import('./database.js').User|null>}
   */
  async findById(id) {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    return await database.users.findOne({ _id: objectId });
  },

  /**
   * Find user by GitHub access token
   * @param {string} githubAccessToken
   * @returns {Promise<import('./database.js').User|null>}
   */
  async findByGithubToken(githubAccessToken) {
    return await database.users.findOne({ githubAccessToken });
  },

  /**
   * Find all users
   * @returns {Promise<import('./database.js').User[]>}
   */
  async findAll() {
    return await database.users.find({}).toArray();
  },

  /**
   * Update user
   * @param {string|ObjectId} id
   * @param {object} updates
   * @returns {Promise<import('./database.js').User|null>}
   */
  async update(id, updates) {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };
    await database.users.updateOne({ _id: objectId }, { $set: updateData });
    return await this.findById(objectId);
  },
};

/**
 * Repository model functions
 */
export const Repository = {
  /**
   * Create a new repository
   * @param {object} repoData
   * @param {string} repoData.owner
   * @param {string} repoData.repo
   * @param {boolean} repoData.configured
   * @param {string|ObjectId} repoData.userId
   * @returns {Promise<import('./database.js').Repository>}
   */
  async create(repoData) {
    const repository = {
      ...repoData,
      userId:
        typeof repoData.userId === 'string'
          ? new ObjectId(repoData.userId)
          : repoData.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await database.repositories.insertOne(repository);
    return { ...repository, _id: result.insertedId };
  },

  /**
   * Find repository by ID
   * @param {string|ObjectId} id
   * @returns {Promise<import('./database.js').Repository|null>}
   */
  async findById(id) {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    return await database.repositories.findOne({ _id: objectId });
  },

  /**
   * Find repository by owner and repo name
   * @param {string} owner
   * @param {string} repo
   * @returns {Promise<import('./database.js').Repository|null>}
   */
  async findByOwnerAndRepo(owner, repo) {
    return await database.repositories.findOne({ owner, repo });
  },

  /**
   * Find all configured repositories
   * @returns {Promise<import('./database.js').Repository[]>}
   */
  async findConfigured() {
    return await database.repositories.find({ configured: true }).toArray();
  },

  /**
   * Find repositories by user ID
   * @param {string|ObjectId} userId
   * @returns {Promise<import('./database.js').Repository[]>}
   */
  async findByUserId(userId) {
    const objectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    return await database.repositories.find({ userId: objectId }).toArray();
  },

  /**
   * Find all repositories
   * @returns {Promise<import('./database.js').Repository[]>}
   */
  async findAll() {
    return await database.repositories.find({}).toArray();
  },

  /**
   * Update repository
   * @param {string|ObjectId} id
   * @param {object} updates
   * @returns {Promise<import('./database.js').Repository|null>}
   */
  async update(id, updates) {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };
    if (updates.userId) {
      updateData.userId =
        typeof updates.userId === 'string'
          ? new ObjectId(updates.userId)
          : updates.userId;
    }
    await database.repositories.updateOne(
      { _id: objectId },
      { $set: updateData }
    );
    return await this.findById(objectId);
  },

  /**
   * Delete repository
   * @param {string|ObjectId} id
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    const result = await database.repositories.deleteOne({ _id: objectId });
    return result.deletedCount > 0;
  },
};
