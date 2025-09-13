#!/usr/bin/env node

import { database, client } from '../src/database/database.js';

async function migrateDatabase() {
  try {
    console.log('Starting database migration: Adding installationId field...');

    // Add installationId field to all existing repositories
    const result = await database.repositories.updateMany(
      { installationId: { $exists: false } },
      { $set: { installationId: null } }
    );

    console.log(
      `Migration complete: Updated ${result.modifiedCount} repositories with installationId field`
    );

    // Show current repository status
    const repos = await database.repositories.find({}).toArray();
    console.log('\nCurrent repository authentication status:');
    for (const repo of repos) {
      const authType = repo.installationId
        ? 'GitHub App'
        : repo.userId
          ? 'PAT'
          : 'None';
      console.log(
        `- ${repo.owner}/${repo.repo}: ${authType} (configured: ${repo.configured})`
      );
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateDatabase();
}

export { migrateDatabase };
