import { database, ObjectId } from './database.js';

/**
 * User model functions
 */
export const User = {
  /**
   * Create a new user
   * @param {object} userData
   * @param {number} userData.githubUserId - GitHub user ID (stable identifier)
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
   * Find user by GitHub user ID
   * @param {number} githubUserId
   * @returns {Promise<import('./database.js').User|null>}
   */
  async findByGithubUserId(githubUserId) {
    return await database.users.findOne({ githubUserId });
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
 *
 * IMPORTANT: As of 2025-10-11, userId field has been removed from repository schema.
 * Repository operations use GitHub App authentication (installationId) exclusively.
 * User OAuth tokens are only used for user-specific UI operations.
 */
export const Repository = {
  /**
   * Create a new repository
   * @param {object} repoData
   * @param {string} repoData.owner
   * @param {string} repoData.repo
   * @param {number} [repoData.installationId] - GitHub App installation ID (required for repository operations)
   * @returns {Promise<import('./database.js').Repository>}
   */
  async create(repoData) {
    const repository = {
      ...repoData,
      installationId: repoData.installationId || null,
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
   * Find repositories by user ID
   * @deprecated This method is deprecated as of 2025-10-11. The userId field has been removed from repositories.
   * User OAuth tokens are no longer used for repository operations.
   * Use findByInstallationId() for repository operations instead.
   * @param {string|ObjectId} _userId - Unused parameter (deprecated)
   * @returns {Promise<import('./database.js').Repository[]>}
   */
  async findByUserId(_userId) {
    console.warn(
      'Repository.findByUserId() is deprecated - userId field no longer exists in repositories'
    );
    return [];
  },

  /**
   * Find repositories by installation ID
   * @param {number} installationId
   * @returns {Promise<import('./database.js').Repository[]>}
   */
  async findByInstallationId(installationId) {
    return await database.repositories.find({ installationId }).toArray();
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
    if (updates.installationId !== undefined) {
      updateData.installationId = updates.installationId;
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
