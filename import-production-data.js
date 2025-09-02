#!/usr/bin/env node

/**
 * Import Production Data Script - MySQL to MongoDB Conversion
 *
 * Converts production.sql (MySQL) data to current MongoDB schema:
 * - Old: `user` table with UUIDs and encrypted tokens
 * - New: `users` collection with ObjectIds and githubAccessToken
 * - Old: `repository` table with `full_name` and encrypted tokens
 * - New: `repositories` collection with `owner`/`repo` fields and userId references
 *
 * Usage: node import-production-data.js [--dry-run]
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { client, database } from './src/database/database.js';

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Extract repository and user data from production.sql
 */
function extractProductionData() {
  console.log('📖 Reading production.sql file...');

  try {
    const sqlContent = readFileSync('./production.sql', 'utf8');

    // Extract repository INSERT statements
    const repoMatch = sqlContent.match(
      /INSERT INTO `repository` VALUES\s*\n([\s\S]*?);/
    );
    const repositories = [];

    if (repoMatch) {
      const repoData = repoMatch[1];
      const repoRows =
        repoData.match(/\('([^']+)','([^']+)','([^']+)'\)/g) || [];

      repositories.push(
        ...repoRows
          .map(row => {
            const match = row.match(/\('([^']+)','([^']+)','([^']+)'\)/);
            if (!match) return null;

            const [, id, fullName, encryptedToken] = match;
            const [owner, repo] = fullName.split('/');

            return {
              originalId: id,
              owner,
              repo,
              fullName,
              configured: true,
              encryptedToken,
            };
          })
          .filter(Boolean)
      );
    }

    // Extract user INSERT statements
    const userMatch = sqlContent.match(
      /INSERT INTO `user` VALUES\s*\n([\s\S]*?);/
    );
    const users = [];

    if (userMatch) {
      const userData = userMatch[1];
      const userRows = userData.match(/\('([^']+)','([^']+)'\)/g) || [];

      users.push(
        ...userRows
          .map(row => {
            const match = row.match(/\('([^']+)','([^']+)'\)/);
            if (!match) return null;

            const [, id, encryptedToken] = match;
            return {
              originalId: id,
              encryptedToken,
            };
          })
          .filter(Boolean)
      );
    }

    console.log(
      `📊 Found ${repositories.length} repositories and ${users.length} users in production data`
    );
    return { users, repositories };
  } catch (error) {
    console.error('❌ Error reading production.sql:', error.message);
    throw error;
  }
}

/**
 * Create user-to-repository mapping based on matching encrypted tokens
 */
function mapUsersToRepositories(users, repositories) {
  console.log('🔗 Mapping users to repositories by encrypted tokens...');

  // Create token-to-user map
  const tokenToUser = {};
  users.forEach(user => {
    tokenToUser[user.encryptedToken] = user;
  });

  // Group repositories by their tokens and find matching users
  const userRepoMappings = [];
  const unmatchedRepos = [];

  repositories.forEach(repo => {
    const matchingUser = tokenToUser[repo.encryptedToken];
    if (matchingUser) {
      // Find existing mapping or create new one
      let mapping = userRepoMappings.find(
        m => m.user.originalId === matchingUser.originalId
      );
      if (!mapping) {
        mapping = {
          user: matchingUser,
          repositories: [],
        };
        userRepoMappings.push(mapping);
      }
      mapping.repositories.push(repo);
    } else {
      unmatchedRepos.push(repo);
    }
  });

  console.log(
    `👥 Mapped ${userRepoMappings.length} users to their repositories`
  );
  console.log(
    `📁 Found ${unmatchedRepos.length} repositories without matching users`
  );

  // Show mapping summary
  userRepoMappings.forEach(mapping => {
    const userId = mapping.user.originalId.substring(0, 8);
    console.log(
      `  👤 User ${userId}... has ${mapping.repositories.length} repositories`
    );
  });

  return { userRepoMappings, unmatchedRepos };
}

/**
 * Convert data to MongoDB format and import
 */
async function importToMongoDB(userRepoMappings, unmatchedRepos) {
  console.log('📥 Converting and importing data to MongoDB...');

  let userCount = 0;
  let repoCount = 0;

  try {
    // Process each user and their repositories
    for (const { user, repositories } of userRepoMappings) {
      if (DRY_RUN) {
        console.log(
          `[DRY RUN] Would create user with ${repositories.length} repositories`
        );
        userCount++;
        repoCount += repositories.length;
        continue;
      }

      // Create MongoDB user document
      const userDoc = {
        githubAccessToken: user.encryptedToken, // Keep encrypted token as-is
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Insert user
      const userResult = await database.users.insertOne(userDoc);
      const mongoUserId = userResult.insertedId;

      console.log(
        `✅ Created user: ${mongoUserId} (was ${user.originalId.substring(0, 8)}...)`
      );
      userCount++;

      // Insert repositories for this user
      for (const repo of repositories) {
        const repoDoc = {
          owner: repo.owner,
          repo: repo.repo,
          configured: repo.configured,
          userId: mongoUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await database.repositories.insertOne(repoDoc);
        console.log(`  📁 Added repository: ${repo.owner}/${repo.repo}`);
        repoCount++;
      }
    }

    // Handle unmatched repositories (create without userId for now)
    if (unmatchedRepos.length > 0 && !DRY_RUN) {
      console.log(
        `\n⚠️  Processing ${unmatchedRepos.length} repositories without matching users...`
      );

      for (const repo of unmatchedRepos) {
        const repoDoc = {
          owner: repo.owner,
          repo: repo.repo,
          configured: repo.configured,
          userId: null, // No matching user found
          createdAt: new Date(),
          updatedAt: new Date(),
          note: 'Imported without matching user - orphaned repository',
        };

        await database.repositories.insertOne(repoDoc);
        console.log(
          `  📁 Added orphaned repository: ${repo.owner}/${repo.repo}`
        );
        repoCount++;
      }
    }
  } catch (error) {
    console.error('❌ Error during MongoDB import:', error);
    throw error;
  }

  console.log(`\n🎉 Import complete!`);
  console.log(`👥 Imported ${userCount} users`);
  console.log(`📁 Imported ${repoCount} repositories`);

  return { userCount, repoCount };
}

/**
 * Verify the import by showing some sample data
 */
async function verifyImport() {
  if (DRY_RUN) return;

  console.log('\n🔍 Verifying import...');

  const userCount = await database.users.countDocuments();
  const repoCount = await database.repositories.countDocuments();

  console.log(`📊 Database now contains:`);
  console.log(`   👥 ${userCount} users`);
  console.log(`   📁 ${repoCount} repositories`);

  // Show a sample user with repositories
  const sampleUser = await database.users.findOne();
  if (sampleUser) {
    const userRepos = await database.repositories
      .find({ userId: sampleUser._id })
      .toArray();
    console.log(
      `\n📝 Sample user ${sampleUser._id} has ${userRepos.length} repositories:`
    );
    userRepos.slice(0, 3).forEach(repo => {
      console.log(
        `   📁 ${repo.owner}/${repo.repo} (configured: ${repo.configured})`
      );
    });
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('🚀 Starting production data import (MySQL → MongoDB)...');
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE IMPORT'}`);

    // Wait for MongoDB connection
    await client.connect();
    console.log('✅ Connected to MongoDB');

    // Extract data from production.sql
    const { users, repositories } = extractProductionData();

    if (users.length === 0 && repositories.length === 0) {
      console.log('❌ No data found to import');
      return;
    }

    // Map users to repositories
    const { userRepoMappings, unmatchedRepos } = mapUsersToRepositories(
      users,
      repositories
    );

    // Import to MongoDB
    await importToMongoDB(userRepoMappings, unmatchedRepos);

    // Verify the import
    await verifyImport();
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('🔌 Database connection closed');
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}
