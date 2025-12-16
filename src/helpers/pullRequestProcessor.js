import { getPullRequestData } from './pullRequest.js';
import {
  mergePullRequest,
  closePullRequest,
  setCommitStatus,
  getLatestCommitSha,
} from './github.js';
import { updateOrCreateWorlddrivenComment } from './commentManager.js';
import { Repository } from '../database/models.js';
import { Auth } from './auth.js';
import { GitHubClient } from './github-client.js';

/**
 * Set GitHub status for a pull request
 * @param {object|number} authMethod - User object or installationId
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @param {object} pullRequestData
 */
async function setPullRequestStatus(
  authMethod,
  owner,
  repo,
  pullNumber,
  pullRequestData
) {
  try {
    const sha = await getLatestCommitSha(authMethod, owner, repo, pullNumber);
    const coefficient = pullRequestData.stats.coefficient;
    const targetUrl = `https://www.worlddriven.org/${owner}/${repo}/pull/${pullNumber}`;

    let state, description;

    if (pullRequestData.times.action === 'merge') {
      const mergeDate = new Date(pullRequestData.times.mergeDate * 1000);
      state = 'success';
      description = `${coefficient.toFixed(2)} Merge at ${mergeDate.toISOString().split('T')[0]}`;
    } else if (pullRequestData.times.action === 'close') {
      const closeDate = new Date(pullRequestData.times.closeDate * 1000);
      state = 'error';
      description = `${coefficient.toFixed(2)} Close at ${closeDate.toISOString().split('T')[0]}`;
    }

    await setCommitStatus(
      authMethod,
      owner,
      repo,
      sha,
      state,
      targetUrl,
      description,
      'World driven'
    );
  } catch (error) {
    console.error(
      `Failed to set status for PR ${owner}/${repo}#${pullNumber}:`,
      error.message
    );
  }
}

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
    const repositories = await Repository.findAll();

    console.log(`Found ${repositories.length} repositories`);

    for (const repository of repositories) {
      const repoResult = {
        name: `${repository.owner}/${repository.repo}`,
        pullRequests: [],
        errors: [],
      };

      console.log(
        `Processing repository: ${repository.owner}/${repository.repo}`
      );

      // Create Auth and GitHubClient for this repository
      const auth = new Auth({
        owner: repository.owner,
        repo: repository.repo,
      });
      const githubClient = new GitHubClient(auth);

      // Verify GitHub App authentication is configured
      if (!repository.installationId) {
        const error = `No GitHub App configured for ${repository.owner}/${repository.repo}`;
        console.log(error);
        repoResult.errors.push(error);
        results.errors++;
        continue;
      }

      const authMethod = repository.installationId;
      console.log(
        `Using GitHub App authentication (installation: ${repository.installationId})`
      );

      try {
        const pullRequests = await githubClient.getPullRequests(
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
              githubClient,
              repository.owner,
              repository.repo,
              pullRequest.number
            );

            prResult.daysToMerge = pullRequestData.times.daysToMerge || null;
            prResult.daysToClose = pullRequestData.times.daysToClose || null;
            // Note: daysToMerge/daysToClose are actually in seconds (legacy naming)
            const actionSeconds =
              pullRequestData.times.daysToMerge ||
              pullRequestData.times.daysToClose;
            const actionDays = actionSeconds / 86400; // Convert to actual days
            console.log(
              `Days to ${pullRequestData.times.action}: ${actionDays.toFixed(2)}`
            );

            // Set GitHub status for this pull request
            await setPullRequestStatus(
              authMethod,
              repository.owner,
              repository.repo,
              pullRequest.number,
              pullRequestData
            );

            if (
              pullRequestData.times.action === 'merge' &&
              pullRequestData.times.daysToMerge < 0
            ) {
              console.log(
                `⚡ Merging ${repository.owner}/${repository.repo} - ${pullRequestData.title} using ${pullRequestData.config.merge_method} method`
              );

              const mergeResponse = await mergePullRequest(
                authMethod,
                repository.owner,
                repository.repo,
                pullRequest.number,
                pullRequestData.config.merge_method
              );

              if (mergeResponse) {
                await updateOrCreateWorlddrivenComment(
                  authMethod,
                  repository.owner,
                  repository.repo,
                  pullRequest.number,
                  pullRequestData,
                  'Pull request merged by worlddriven ✅'
                );
                console.log('✅ Merged successfully');
                prResult.action = 'merged';
                results.merged++;
              } else {
                console.log('❌ Cannot merge PR');
                prResult.action = 'merge_failed';
              }
            } else if (
              pullRequestData.times.action === 'close' &&
              pullRequestData.times.daysToClose < 0
            ) {
              console.log(
                `🗑️  Closing ${repository.owner}/${repository.repo} - ${pullRequestData.title} due to negative feedback`
              );

              const closeResponse = await closePullRequest(
                authMethod,
                repository.owner,
                repository.repo,
                pullRequest.number
              );

              if (closeResponse) {
                await updateOrCreateWorlddrivenComment(
                  authMethod,
                  repository.owner,
                  repository.repo,
                  pullRequest.number,
                  pullRequestData,
                  'Pull request closed by worlddriven ❌'
                );
                console.log('✅ Closed successfully');
                prResult.action = 'closed';
              } else {
                console.log('❌ Cannot close PR');
                prResult.action = 'close_failed';
              }
            } else {
              const daysRemaining = Math.ceil(
                (pullRequestData.times.daysToMerge ||
                  pullRequestData.times.daysToClose) / 86400
              );
              const action = pullRequestData.times.action;
              console.log(
                `⏳ PR not ready for ${action} (${daysRemaining} days remaining)`
              );

              // Update comment to refresh countdown without adding activity log entry
              await updateOrCreateWorlddrivenComment(
                authMethod,
                repository.owner,
                repository.repo,
                pullRequest.number,
                pullRequestData,
                null // Don't add activity log entry for scheduled updates
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

  if (!repository) {
    throw new Error(`Repository ${owner}/${repo} not found`);
  }

  // Create Auth and GitHubClient for this repository
  const auth = new Auth({ owner, repo });
  const githubClient = new GitHubClient(auth);

  const pullRequests = await githubClient.getPullRequests(owner, repo);
  const results = [];

  for (const pullRequest of pullRequests) {
    const pullRequestData = await getPullRequestData(
      githubClient,
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
