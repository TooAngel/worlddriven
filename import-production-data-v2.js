#!/usr/bin/env node

/**
 * Import Production Data Script v2 - Repository-Centric Approach
 *
 * Converts production.sql (MySQL) data to current MongoDB schema where
 * repositories have their own GitHub access tokens (not linked via users):
 * - Old: `repository` table with `full_name` and encrypted tokens
 * - New: `repositories` collection with `owner`/`repo` fields and decrypted `githubAccessToken`
 *
 * Usage: node import-production-data-v2.js [--dry-run] [--clear]
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { client, database } from './src/database/database.js';
import { decryptToken } from './decrypt-tokens.js';

const DRY_RUN = process.argv.includes('--dry-run');
const CLEAR_DB = process.argv.includes('--clear');

/**
 * Extract repository data from production.sql
 */
function extractRepositoryData() {
  console.log('📖 Reading production.sql file...');

  try {
    const sqlContent = readFileSync('./production.sql', 'utf8');

    // Extract repository INSERT statements
    const repoMatch = sqlContent.match(
      /INSERT INTO `repository` VALUES\s*\n([\s\S]*?);/
    );

    if (!repoMatch) {
      console.log('❌ No repository data found in production.sql');
      return [];
    }

    const repoData = repoMatch[1];
    const repoRows = repoData.match(/\('([^']+)','([^']+)','([^']+)'\)/g) || [];

    const repositories = repoRows
      .map(row => {
        const match = row.match(/\('([^']+)','([^']+)','([^']+)'\)/);
        if (!match) return null;

        const [, id, fullName, encryptedToken] = match;
        const [owner, repo] = fullName.split('/');

        if (!owner || !repo) {
          console.warn(`⚠️ Invalid full_name format: ${fullName}`);
          return null;
        }

        return {
          originalId: id,
          owner,
          repo,
          fullName,
          configured: true,
          encryptedToken,
        };
      })
      .filter(Boolean);

    console.log(
      `📊 Found ${repositories.length} repositories in production data`
    );
    return repositories;
  } catch (error) {
    console.error('❌ Error reading production.sql:', error.message);
    throw error;
  }
}

/**
 * Process repositories and decrypt their tokens
 */
function processRepositories(repositories) {
  console.log('🔓 Processing repositories and decrypting tokens...');

  const processedRepos = [];
  const failedRepos = [];

  repositories.forEach(repo => {
    try {
      // Decrypt the token
      const decryptedToken = decryptToken(repo.encryptedToken);

      const processedRepo = {
        owner: repo.owner,
        repo: repo.repo,
        configured: repo.configured,
        githubAccessToken: decryptedToken,
        originalId: repo.originalId,
        importedFrom: 'production.sql',
        importedAt: new Date(),
      };

      processedRepos.push(processedRepo);
      console.log(
        `✅ Processed ${repo.owner}/${repo.repo} - Token: ${decryptedToken.substring(0, 8)}...`
      );
    } catch (error) {
      console.error(
        `❌ Failed to decrypt token for ${repo.owner}/${repo.repo}: ${error.message}`
      );
      failedRepos.push(repo);
    }
  });

  console.log(
    `✅ Successfully processed ${processedRepos.length} repositories`
  );
  if (failedRepos.length > 0) {
    console.log(`❌ Failed to process ${failedRepos.length} repositories`);
  }

  return { processedRepos, failedRepos };
}

/**
 * Import repositories to MongoDB
 */
async function importRepositoriesToMongoDB(repositories) {
  console.log('📥 Importing repositories to MongoDB...');

  let importCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const repo of repositories) {
    try {
      if (DRY_RUN) {
        console.log(`[DRY RUN] Would import ${repo.owner}/${repo.repo}`);
        importCount++;
        continue;
      }

      // Check if repository already exists
      const existing = await database.repositories.findOne({
        owner: repo.owner,
        repo: repo.repo,
      });

      if (existing) {
        // Update existing repository with token if it doesn't have one
        if (!existing.githubAccessToken && repo.githubAccessToken) {
          await database.repositories.updateOne(
            { _id: existing._id },
            {
              $set: {
                githubAccessToken: repo.githubAccessToken,
                updatedAt: new Date(),
                importedFrom: repo.importedFrom,
                importedAt: repo.importedAt,
              },
            }
          );
          console.log(
            `🔄 Updated ${repo.owner}/${repo.repo} with GitHub token`
          );
          importCount++;
        } else {
          console.log(
            `⏭️ Skipped ${repo.owner}/${repo.repo} (already exists with token)`
          );
          skipCount++;
        }
      } else {
        // Create new repository
        const repoDoc = {
          owner: repo.owner,
          repo: repo.repo,
          configured: repo.configured,
          githubAccessToken: repo.githubAccessToken,
          userId: null, // No user linkage in this approach
          createdAt: new Date(),
          updatedAt: new Date(),
          importedFrom: repo.importedFrom,
          importedAt: repo.importedAt,
          originalId: repo.originalId,
        };

        await database.repositories.insertOne(repoDoc);
        console.log(`✅ Imported ${repo.owner}/${repo.repo}`);
        importCount++;
      }
    } catch (error) {
      console.error(
        `❌ Error importing ${repo.owner}/${repo.repo}:`,
        error.message
      );
      errorCount++;
    }
  }

  console.log(`\n🎉 Import complete!`);
  console.log(`📁 Imported/Updated: ${importCount} repositories`);
  console.log(`⏭️ Skipped: ${skipCount} repositories`);
  if (errorCount > 0) {
    console.log(`❌ Errors: ${errorCount} repositories`);
  }

  return { importCount, skipCount, errorCount };
}

/**
 * Clear existing data if requested
 */
async function clearDatabase() {
  if (!CLEAR_DB) return;

  if (DRY_RUN) {
    console.log('[DRY RUN] Would clear repositories collection');
    return;
  }

  console.log('🗑️ Clearing existing repositories...');
  const result = await database.repositories.deleteMany({});
  console.log(`✅ Cleared ${result.deletedCount} repositories`);
}

/**
 * Verify the import by showing some sample data
 */
async function verifyImport() {
  if (DRY_RUN) return;

  console.log('\n🔍 Verifying import...');

  const totalRepos = await database.repositories.countDocuments();
  const configuredRepos = await database.repositories.countDocuments({
    configured: true,
  });
  const reposWithTokens = await database.repositories.countDocuments({
    githubAccessToken: { $exists: true, $ne: null },
  });

  console.log(`📊 Database summary:`);
  console.log(`   📁 Total repositories: ${totalRepos}`);
  console.log(`   ✅ Configured repositories: ${configuredRepos}`);
  console.log(`   🔑 Repositories with tokens: ${reposWithTokens}`);

  // Show sample repositories
  const sampleRepos = await database.repositories
    .find({ githubAccessToken: { $exists: true } })
    .limit(5)
    .toArray();

  if (sampleRepos.length > 0) {
    console.log(`\n📝 Sample repositories with tokens:`);
    sampleRepos.forEach(repo => {
      const token = repo.githubAccessToken
        ? repo.githubAccessToken.substring(0, 8) + '...'
        : 'none';
      console.log(`   📁 ${repo.owner}/${repo.repo} - Token: ${token}`);
    });
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log(
      '🚀 Starting production data import v2 (Repository-centric)...'
    );
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE IMPORT'}`);
    if (CLEAR_DB) console.log('⚠️ Database will be cleared first');

    // Wait for MongoDB connection
    await client.connect();
    console.log('✅ Connected to MongoDB');

    // Clear database if requested
    await clearDatabase();

    // Extract repository data from production.sql
    const repositories = extractRepositoryData();

    if (repositories.length === 0) {
      console.log('❌ No repository data found to import');
      return;
    }

    // Process repositories and decrypt tokens
    const { processedRepos } = processRepositories(repositories);

    if (processedRepos.length === 0) {
      console.log('❌ No repositories were successfully processed');
      return;
    }

    // Import to MongoDB
    await importRepositoriesToMongoDB(processedRepos);

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

// Show help if requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node import-production-data-v2.js [options]');
  console.log('');
  console.log('Options:');
  console.log(
    '  --dry-run    Show what would be imported without making changes'
  );
  console.log('  --clear      Clear repositories collection before import');
  console.log('  --help       Show this help message');
  console.log('');
  console.log('Environment variables:');
  console.log('  MONGO_URL        MongoDB connection string');
  console.log('  ENCRYPTION_KEY   Encryption key for decrypting tokens');
  process.exit(0);
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}
