#!/usr/bin/env node

import { database, client } from '../src/database/database.js';

/**
 * Remove the configured field from repositories collection
 * This migration is idempotent and safe to run multiple times
 */
async function removeConfiguredField() {
  try {
    console.log('[MIGRATION] Checking configured field removal status...');

    // Check if migration is needed
    const reposWithConfiguredField = await database.repositories.countDocuments(
      {
        configured: { $exists: true },
      }
    );

    if (reposWithConfiguredField === 0) {
      console.log(
        '[MIGRATION] ✅ Already migrated - no repositories have configured field'
      );
      return;
    }

    console.log(
      `[MIGRATION] Found ${reposWithConfiguredField} repositories with configured field`
    );

    // Count repositories before migration
    const unconfiguredCount = await database.repositories.countDocuments({
      configured: false,
    });

    if (unconfiguredCount > 0) {
      console.log(
        `[MIGRATION] Deleting ${unconfiguredCount} unconfigured repositories...`
      );

      // Delete all repositories where configured: false
      const deleteResult = await database.repositories.deleteMany({
        configured: false,
      });

      console.log(
        `[MIGRATION] ✅ Deleted ${deleteResult.deletedCount} unconfigured repositories`
      );
    }

    // Remove the configured field from all remaining repositories
    console.log('[MIGRATION] Removing configured field from repositories...');
    const updateResult = await database.repositories.updateMany(
      { configured: { $exists: true } },
      { $unset: { configured: '' } }
    );

    console.log(
      `[MIGRATION] ✅ Removed configured field from ${updateResult.modifiedCount} repositories`
    );

    const remainingCount = await database.repositories.countDocuments({});
    console.log(
      `[MIGRATION] ✅ Migration complete - ${remainingCount} repositories remain`
    );
  } catch (error) {
    console.error('[MIGRATION] ❌ Failed to remove configured field:', error);
    throw error;
  }
}

// Allow running as standalone script
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await removeConfiguredField();
  } catch {
    process.exit(1);
  } finally {
    await client.close();
  }
}

export { removeConfiguredField };
