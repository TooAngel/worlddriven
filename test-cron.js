#!/usr/bin/env node

/**
 * Test script for World Driven pull request processing
 *
 * Usage:
 *   node test-cron.js                    # Process all configured repositories
 *   node test-cron.js --repo owner/repo  # Process specific repository
 *   node test-cron.js --dry-run          # Run without making actual changes
 */

import {
  processPullRequests,
  processRepositoryPullRequests,
} from './src/helpers/pullRequestProcessor.js';
import { database } from './src/database/database.js';

async function main() {
  const args = process.argv.slice(2);
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('🧪 World Driven Test Script');
  console.log('==========================');

  // Check database connection
  try {
    if (!database.db) {
      throw new Error('MongoDB connection not established');
    }
    await database.db.admin().ping();
    console.log('✅ MongoDB connection established');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);

    if (!process.env.MONGO_URL) {
      console.log('\n💡 Tip: Set the MONGO_URL environment variable');
      console.log(
        'Example: export MONGO_URL="mongodb://localhost:27017/worlddriven"'
      );
    }

    process.exit(1);
  }

  try {
    let results;

    // Check if specific repository requested
    const repoIndex = args.findIndex(arg => arg === '--repo');
    if (repoIndex !== -1 && args[repoIndex + 1]) {
      const repoPath = args[repoIndex + 1];
      const [owner, repo] = repoPath.split('/');

      if (!owner || !repo) {
        console.error('❌ Invalid repository format. Use: owner/repo');
        process.exit(1);
      }

      console.log(`🎯 Processing specific repository: ${owner}/${repo}`);
      const repoResults = await processRepositoryPullRequests(owner, repo);

      console.log('\n📊 Results:');
      repoResults.forEach(pr => {
        const status = pr.readyToMerge ? '🟢 Ready to merge' : '🟡 Waiting';
        const daysRemaining = pr.readyToMerge
          ? 0
          : Math.ceil(pr.daysToMerge / 86400);
        console.log(`  PR #${pr.number}: ${pr.title}`);
        console.log(`    Status: ${status}`);
        if (!pr.readyToMerge) {
          console.log(`    Days remaining: ${daysRemaining}`);
        }
        console.log(
          `    Votes: ${pr.stats.votes}/${pr.stats.votesTotal} (${Math.round(pr.stats.coefficient * 100)}%)`
        );
        console.log('');
      });
    } else {
      // Process all repositories
      console.log('🚀 Processing all configured repositories...');
      results = await processPullRequests();

      console.log('\n📊 Summary:');
      console.log(`  Repositories processed: ${results.repositories.length}`);
      console.log(`  Pull requests processed: ${results.processed}`);
      console.log(`  Pull requests merged: ${results.merged}`);
      console.log(`  Errors encountered: ${results.errors}`);

      if (results.repositories.length > 0) {
        console.log('\n📋 Repository Details:');
        results.repositories.forEach(repo => {
          console.log(`\n  📁 ${repo.name}:`);
          console.log(`    Pull requests: ${repo.pullRequests.length}`);

          const merged = repo.pullRequests.filter(
            pr => pr.action === 'merged'
          ).length;
          const waiting = repo.pullRequests.filter(
            pr => pr.action === 'waiting'
          ).length;
          const failed = repo.pullRequests.filter(
            pr => pr.action === 'merge_failed'
          ).length;

          if (merged > 0) console.log(`    ✅ Merged: ${merged}`);
          if (waiting > 0) console.log(`    ⏳ Waiting: ${waiting}`);
          if (failed > 0) console.log(`    ❌ Failed to merge: ${failed}`);

          if (repo.errors.length > 0) {
            console.log(`    🚨 Errors: ${repo.errors.length}`);
            repo.errors.forEach(error => console.log(`      - ${error}`));
          }
        });
      }
    }

    console.log('\n✅ Test completed successfully');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // MongoDB connection stays open for process lifetime
    console.log('🔌 Test completed');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⚠️ Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️ Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage:');
  console.log(
    '  node test-cron.js                    # Process all configured repositories'
  );
  console.log(
    '  node test-cron.js --repo owner/repo  # Process specific repository'
  );
  console.log('  node test-cron.js --help             # Show this help');
  console.log('');
  console.log('Environment variables:');
  console.log('  MONGO_URL  MongoDB connection string (required)');
  process.exit(0);
}

// Run the main function
main().catch(console.error);
