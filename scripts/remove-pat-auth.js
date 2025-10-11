#!/usr/bin/env node

/**
 * Database Migration: Remove PAT Authentication for Repository Access
 *
 * This script removes PAT authentication for repository operations after
 * successful migration to GitHub App authentication.
 *
 * IMPORTANT: User OAuth authentication is KEPT for UI and user-specific API calls.
 *
 * Changes:
 * - Removes userId field from all repositories (no longer used for repository access)
 * - KEEPS users collection (still needed for OAuth login and user-specific operations)
 * - Verifies all repositories have installationId
 *
 * Run with: node scripts/remove-pat-auth.js
 */

import {
  database,
  client,
  connectionPromise,
} from '../src/database/database.js';

async function removePatAuthentication() {
  try {
    // Wait for database connection to be established
    await connectionPromise;

    console.log('[MIGRATION] Checking PAT authentication removal status...');

    // Step 1: Check if migration is already complete
    const reposWithUserId = await database.repositories
      .find({
        userId: { $exists: true },
      })
      .toArray();

    if (reposWithUserId.length === 0) {
      console.log(
        '[MIGRATION] ✅ Already migrated - no repositories have userId field'
      );
      return { alreadyMigrated: true, repositoriesUpdated: 0 };
    }

    console.log(
      `[MIGRATION] Found ${reposWithUserId.length} repositories with userId field to migrate`
    );

    // Step 2: Verify all repositories have GitHub App authentication
    console.log('[MIGRATION] Verifying GitHub App authentication...');
    const reposWithoutApp = await database.repositories
      .find({
        installationId: null,
      })
      .toArray();

    if (reposWithoutApp.length > 0) {
      console.error(
        '[MIGRATION] ⚠️  WARNING: Found repositories without GitHub App authentication:'
      );
      reposWithoutApp.forEach(repo => {
        console.error(`[MIGRATION]   - ${repo.owner}/${repo.repo}`);
      });
      console.error(
        '[MIGRATION] Migration skipped. Please configure GitHub App for all repositories first.'
      );
      return {
        error: 'Repositories without GitHub App',
        reposWithoutApp: reposWithoutApp.length,
      };
    }
    console.log(
      '[MIGRATION] ✅ All repositories have GitHub App authentication'
    );

    // Step 3: Remove userId field from all repositories
    console.log('[MIGRATION] Removing userId field from repositories...');
    const updateResult = await database.repositories.updateMany(
      { userId: { $exists: true } },
      { $unset: { userId: '' } }
    );
    console.log(
      `[MIGRATION] ✅ Removed userId from ${updateResult.modifiedCount} repositories`
    );

    // Step 4: Verify users collection is preserved
    const userCount = await database.users.countDocuments();
    console.log(
      `[MIGRATION] ℹ️  User collection preserved (${userCount} users for OAuth)`
    );

    // Step 5: Verify final state
    const finalRepos = await database.repositories.find({}).toArray();
    const hasUserId = finalRepos.some(repo => repo.userId !== undefined);

    if (hasUserId) {
      console.error(
        '[MIGRATION] ❌ ERROR: Some repositories still have userId field'
      );
      return { error: 'Migration verification failed' };
    }

    console.log('[MIGRATION] ✅ Migration completed successfully');
    console.log(
      `[MIGRATION] Summary: ${updateResult.modifiedCount} repositories migrated, ${userCount} users preserved`
    );

    return {
      success: true,
      repositoriesUpdated: updateResult.modifiedCount,
      usersPreserved: userCount,
      totalRepositories: finalRepos.length,
    };
  } catch (error) {
    console.error('[MIGRATION] ❌ Migration failed:', error.message);
    return { error: error.message };
  }
}

// Only close client if run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  removePatAuthentication()
    .then(result => {
      console.log('[MIGRATION] Result:', result);
      process.exit(result?.error ? 1 : 0);
    })
    .catch(error => {
      console.error('[MIGRATION] Unexpected error:', error);
      process.exit(1);
    })
    .finally(() => {
      client.close();
    });
}

export { removePatAuthentication };
