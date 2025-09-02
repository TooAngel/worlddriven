import { getPullRequestData } from './pullRequest.js';
import {
  createIssueComment,
  getPullRequests,
  mergePullRequest,
} from './github.js';
import { User, Repository } from '../database/models.js';

/**
 * Process all pull requests for configured repositories
 * @return {Promise<Object>} Processing results
 */
export async function processPullRequests() {
  console.log(
    '-----------------------------------------------------------------'
  );
  console.log(`Starting PR processing at ${new Date().toISOString()}`);

  const results = {
    processed: 0,
    merged: 0,
    errors: 0,
    repositories: [],
  };

  try {
    const repositories = await Repository.findConfigured();

    console.log(`Found ${repositories.length} configured repositories`);

    for (const repository of repositories) {
      const repoResult = {
        name: `${repository.owner}/${repository.repo}`,
        pullRequests: [],
        errors: [],
      };

      console.log(
        `Processing repository: ${repository.owner}/${repository.repo}`
      );

      const user = await User.findById(repository.userId);
      if (!user) {
        const error = `No user found for repository ${repository.owner}/${repository.repo}`;
        console.log(error);
        repoResult.errors.push(error);
        results.errors++;
        continue;
      }

      try {
        const pullRequests = await getPullRequests(
          user,
          repository.owner,
          repository.repo
        );
        console.log(`Found ${pullRequests.length} pull requests`);

        for (const pullRequest of pullRequests) {
          const prResult = {
            number: pullRequest.number,
            title: pullRequest.title,
            action: 'none',
            daysToMerge: null,
            error: null,
          };

          console.log(
            `Analyzing PR #${pullRequest.number}: ${pullRequest.title}`
          );

          try {
            const pullRequestData = await getPullRequestData(
              user,
              repository.owner,
              repository.repo,
              pullRequest.number
            );

            prResult.daysToMerge = pullRequestData.times.daysToMerge;
            console.log(`Days to merge: ${pullRequestData.times.daysToMerge}`);

            if (pullRequestData.times.daysToMerge < 0) {
              console.log(
                `⚡ Merging ${repository.owner}/${repository.repo} - ${pullRequestData.title}`
              );

              const mergeResponse = await mergePullRequest(
                user,
                repository.owner,
                repository.repo,
                pullRequest.number
              );

              if (mergeResponse) {
                const comment =
                  'This pull request was merged by [worlddriven](https://www.worlddriven.org).';
                await createIssueComment(
                  user,
                  repository.owner,
                  repository.repo,
                  pullRequest.number,
                  comment
                );
                console.log('✅ Merged successfully');
                prResult.action = 'merged';
                results.merged++;
              } else {
                console.log('❌ Cannot merge PR');
                prResult.action = 'merge_failed';
              }
            } else {
              const daysRemaining = Math.ceil(
                pullRequestData.times.daysToMerge / 86400
              );
              console.log(
                `⏳ PR not ready for merge (${daysRemaining} days remaining)`
              );
              prResult.action = 'waiting';
            }

            results.processed++;
          } catch (error) {
            const errorMsg = `Error processing PR #${pullRequest.number}: ${error.message}`;
            console.error(errorMsg);
            prResult.error = error.message;
            results.errors++;
          }

          repoResult.pullRequests.push(prResult);
        }
      } catch (error) {
        const errorMsg = `Error processing repository ${repository.owner}/${repository.repo}: ${error.message}`;
        console.error(errorMsg);
        repoResult.errors.push(error.message);
        results.errors++;
      }

      results.repositories.push(repoResult);
    }
  } catch (error) {
    console.error('Error in pull request processing:', error.message);
    results.errors++;
  }

  console.log(`Completed PR processing at ${new Date().toISOString()}`);
  console.log(
    `Summary: ${results.processed} processed, ${results.merged} merged, ${results.errors} errors`
  );
  console.log(
    '-----------------------------------------------------------------'
  );

  return results;
}

/**
 * Process pull requests for a specific repository
 * @param {string} owner Repository owner
 * @param {string} repo Repository name
 * @return {Promise<Object>} Processing results for the repository
 */
export async function processRepositoryPullRequests(owner, repo) {
  console.log(`Processing specific repository: ${owner}/${repo}`);

  const repository = await Repository.findByOwnerAndRepo(owner, repo);

  if (!repository || !repository.configured) {
    throw new Error(`Repository ${owner}/${repo} not found or not configured`);
  }

  const user = await User.findById(repository.userId);
  if (!user) {
    throw new Error(`User not found for repository ${owner}/${repo}`);
  }

  const pullRequests = await getPullRequests(user, owner, repo);
  const results = [];

  for (const pullRequest of pullRequests) {
    const pullRequestData = await getPullRequestData(
      user,
      owner,
      repo,
      pullRequest.number
    );

    results.push({
      number: pullRequest.number,
      title: pullRequest.title,
      daysToMerge: pullRequestData.times.daysToMerge,
      readyToMerge: pullRequestData.times.daysToMerge < 0,
      stats: pullRequestData.stats,
      times: pullRequestData.times,
    });
  }

  return results;
}
