import { getPullRequestData } from './pullRequest.js';
import { setCommitStatus, getLatestCommitSha } from './github.js';
import { updateOrCreateWorlddrivenComment } from './commentManager.js';
import { Repository } from '../database/models.js';

/**
 * Set GitHub status for a pull request
 * @param {number} installationId
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @param {object} pullRequestData
 */
async function setPullRequestStatus(
  installationId,
  owner,
  repo,
  pullNumber,
  pullRequestData
) {
  try {
    const sha = await getLatestCommitSha(
      installationId,
      owner,
      repo,
      pullNumber
    );
    const coefficient = pullRequestData.stats.coefficient;
    const targetUrl = `https://www.worlddriven.org/${owner}/${repo}/pull/${pullNumber}`;

    let state, description;

    if (coefficient >= 0) {
      const mergeDate = new Date(pullRequestData.times.mergeDate * 1000);
      state = 'success';
      description = `${coefficient.toFixed(2)} Merge at ${mergeDate.toISOString().split('T')[0]}`;
    } else {
      state = 'error';
      description = `${coefficient.toFixed(2)} Will not merge`;
    }

    await setCommitStatus(
      installationId,
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
 * Process a pull request and update its status
 * @param {number} installationId
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @returns {object} Pull request data
 */
async function processPullRequest(installationId, owner, repo, pullNumber) {
  console.log(`Processing PR ${owner}/${repo}#${pullNumber} from webhook`);

  const pullRequestData = await getPullRequestData(
    installationId,
    owner,
    repo,
    pullNumber
  );
  await setPullRequestStatus(
    installationId,
    owner,
    repo,
    pullNumber,
    pullRequestData
  );

  return pullRequestData;
}

/**
 * Handle pull_request webhook events (opened, synchronize, etc.)
 */
export async function handlePullRequestWebhook(data) {
  const { action, pull_request: pullRequest, repository } = data;

  console.log(
    `Webhook: pull_request ${action} for ${repository.full_name}#${pullRequest.number}`
  );

  // Find configured repository
  const [owner, repo] = repository.full_name.split('/');
  const dbRepository = await Repository.findByOwnerAndRepo(owner, repo);

  if (!dbRepository || !dbRepository.configured) {
    console.log(
      `Repository ${repository.full_name} not configured, ignoring webhook`
    );
    return { info: 'Repository not configured' };
  }

  // Check for GitHub App installation
  if (!dbRepository.installationId) {
    console.error(
      `No GitHub App configured for repository ${repository.full_name}`
    );
    return { error: 'No GitHub App configured' };
  }

  try {
    const installationId = dbRepository.installationId;

    if (action === 'opened') {
      const pullRequestData = await processPullRequest(
        installationId,
        owner,
        repo,
        pullRequest.number
      );

      await updateOrCreateWorlddrivenComment(
        installationId,
        owner,
        repo,
        pullRequest.number,
        pullRequestData,
        'Pull request opened'
      );
    } else if (action === 'synchronize') {
      const pullRequestData = await processPullRequest(
        installationId,
        owner,
        repo,
        pullRequest.number
      );

      await updateOrCreateWorlddrivenComment(
        installationId,
        owner,
        repo,
        pullRequest.number,
        pullRequestData,
        'Branch synchronized (merge timer reset)'
      );
    } else if (action === 'edited' || action === 'closed') {
      // For edited/closed, we might want to update status or clean up
      console.log(`PR ${action}: ${pullRequest.title}`);
    }

    return { info: 'Webhook processed successfully' };
  } catch (error) {
    console.error(`Error processing pull request webhook:`, error);
    return { error: error.message };
  }
}

/**
 * Handle pull_request_review webhook events
 */
export async function handlePullRequestReviewWebhook(data) {
  const { action, review, pull_request: pullRequest, repository } = data;

  if (action !== 'submitted') {
    return { info: 'Review action not submitted, ignoring' };
  }

  if (!review.state || review.state === 'commented') {
    return { info: 'Review is only a comment, ignoring' };
  }

  console.log(
    `Webhook: pull_request_review ${review.state} for ${repository.full_name}#${pullRequest.number} by ${review.user.login}`
  );

  // Find configured repository
  const [owner, repo] = repository.full_name.split('/');
  const dbRepository = await Repository.findByOwnerAndRepo(owner, repo);

  if (!dbRepository || !dbRepository.configured) {
    console.log(
      `Repository ${repository.full_name} not configured, ignoring webhook`
    );
    return { info: 'Repository not configured' };
  }

  // Check for GitHub App installation
  if (!dbRepository.installationId) {
    console.error(
      `No GitHub App configured for repository ${repository.full_name}`
    );
    return { error: 'No GitHub App configured' };
  }

  try {
    const installationId = dbRepository.installationId;

    const pullRequestData = await processPullRequest(
      installationId,
      owner,
      repo,
      pullRequest.number
    );

    let activityMessage = '';
    if (review.state === 'approved') {
      activityMessage = `@${review.user.login} **agreed** ✅`;
    } else if (review.state === 'changes_requested') {
      activityMessage = `@${review.user.login} **disagreed** ❌`;
    } else {
      activityMessage = `@${review.user.login} reviewed`;
    }

    await updateOrCreateWorlddrivenComment(
      installationId,
      owner,
      repo,
      pullRequest.number,
      pullRequestData,
      activityMessage
    );

    return { info: 'Review webhook processed successfully' };
  } catch (error) {
    console.error(`Error processing pull request review webhook:`, error);
    return { error: error.message };
  }
}

/**
 * Handle push webhook events
 */
export async function handlePushWebhook(data) {
  console.log(`Webhook: push to ${data.repository.full_name}`);
  // For now, we just acknowledge push events
  return { info: 'Push webhook received' };
}
