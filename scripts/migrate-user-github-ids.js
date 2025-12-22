#!/usr/bin/env node

import {
  database,
  client,
  connectionPromise,
} from '../src/database/database.js';

/**
 * Fetch GitHub user info using an access token
 * @param {string} accessToken
 * @returns {Promise<{id: number, login: string} | null>}
 */
async function fetchGitHubUser(accessToken) {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      console.error(
        `Failed to fetch GitHub user: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const user = await response.json();
    return { id: user.id, login: user.login };
  } catch (error) {
    console.error('Error fetching GitHub user:', error);
    return null;
  }
}

async function migrateDatabase() {
  try {
    // Wait for database connection to be established
    await connectionPromise;

    console.log('[MIGRATION] Checking user GitHub ID migration status...');

    // Check if migration is already complete
    const usersWithoutGithubId = await database.users
      .find({ githubUserId: { $exists: false } })
      .toArray();

    if (usersWithoutGithubId.length === 0) {
      console.log(
        '[MIGRATION] ✅ Already migrated - all users have githubUserId field'
      );
      return { alreadyMigrated: true, usersUpdated: 0 };
    }

    console.log(
      `[MIGRATION] Found ${usersWithoutGithubId.length} users without githubUserId to migrate`
    );

    const usersByGithubId = new Map();
    const failedUsers = [];

    // Fetch GitHub user IDs for existing users
    for (const user of usersWithoutGithubId) {
      console.log(`[MIGRATION] Processing user ${user._id}...`);

      const githubUser = await fetchGitHubUser(user.githubAccessToken);

      if (!githubUser) {
        console.warn(
          `[MIGRATION]   ⚠️  Could not fetch GitHub user info for user ${user._id} (token may be expired)`
        );
        failedUsers.push(user);
        continue;
      }

      console.log(
        `[MIGRATION]   ✓ Found GitHub user: ${githubUser.login} (ID: ${githubUser.id})`
      );

      // Track users by GitHub ID to find duplicates
      if (!usersByGithubId.has(githubUser.id)) {
        usersByGithubId.set(githubUser.id, []);
      }
      usersByGithubId.get(githubUser.id).push({
        ...user,
        githubUserId: githubUser.id,
        githubLogin: githubUser.login,
      });
    }

    // Process users: update or merge duplicates
    let updatedCount = 0;
    let mergedCount = 0;

    for (const [githubUserId, users] of usersByGithubId.entries()) {
      if (users.length === 1) {
        // Single user - just update
        const user = users[0];
        await database.users.updateOne(
          { _id: user._id },
          {
            $set: {
              githubUserId: githubUserId,
              updatedAt: new Date(),
            },
          }
        );
        updatedCount++;
        console.log(
          `[MIGRATION]   ✓ Updated user ${user._id} with githubUserId ${githubUserId}`
        );
      } else {
        // Multiple users with same GitHub ID - merge them
        console.log(
          `[MIGRATION]   ⚠️  Found ${users.length} duplicate users for GitHub ID ${githubUserId}`
        );

        // Keep the most recently updated user
        const sortedUsers = users.sort(
          (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
        );
        const keepUser = sortedUsers[0];
        const deleteUsers = sortedUsers.slice(1);

        // Update the keeper with githubUserId
        await database.users.updateOne(
          { _id: keepUser._id },
          {
            $set: {
              githubUserId: githubUserId,
              updatedAt: new Date(),
            },
          }
        );

        // Delete duplicate users
        for (const user of deleteUsers) {
          await database.users.deleteOne({ _id: user._id });
          console.log(`[MIGRATION]     • Deleted duplicate user ${user._id}`);
        }

        mergedCount += deleteUsers.length;
        console.log(
          `[MIGRATION]   ✓ Kept user ${keepUser._id}, deleted ${deleteUsers.length} duplicates`
        );
      }
    }

    // Delete orphaned users with expired tokens
    // These users cannot be linked to GitHub accounts and would create
    // duplicate records on next login anyway
    let deletedOrphanedCount = 0;
    if (failedUsers.length > 0) {
      console.log(
        `\n[MIGRATION] Cleaning up ${failedUsers.length} orphaned users with expired tokens...`
      );
      for (const user of failedUsers) {
        await database.users.deleteOne({ _id: user._id });
        console.log(`[MIGRATION]   • Deleted orphaned user ${user._id}`);
        deletedOrphanedCount++;
      }
    }

    console.log('\n[MIGRATION] Migration summary:');
    console.log(`[MIGRATION]   • Updated: ${updatedCount} users`);
    console.log(`[MIGRATION]   • Merged: ${mergedCount} duplicate users`);
    console.log(
      `[MIGRATION]   • Deleted orphaned: ${deletedOrphanedCount} users (expired tokens)`
    );

    // Create unique index on githubUserId
    console.log('\n[MIGRATION] Creating unique index on githubUserId...');
    try {
      await database.users.createIndex(
        { githubUserId: 1 },
        { unique: true, sparse: true }
      );
      console.log('[MIGRATION]   ✓ Index created successfully');
    } catch (error) {
      if (error.code === 85) {
        console.log('[MIGRATION]   • Index already exists, skipping');
      } else {
        throw error;
      }
    }

    console.log('\n[MIGRATION] ✓ User GitHub ID migration complete!');
  } catch (error) {
    console.error(
      '[MIGRATION] ❌ User GitHub ID migration failed:',
      error.message
    );
    throw error;
  }
}

// Only close client if run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateDatabase()
    .then(() => {
      console.log('[MIGRATION] Migration completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('[MIGRATION] Unexpected error:', error);
      process.exit(1);
    })
    .finally(() => {
      client.close();
    });
}

export { migrateDatabase };
