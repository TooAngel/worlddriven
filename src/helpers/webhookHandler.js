import { getPullRequestData } from './pullRequest.js';
import {
  setCommitStatus,
  getLatestCommitSha,
  createIssueComment,
} from './github.js';
import { User, Repository } from '../database/models.js';

/**
 * Set GitHub status for a pull request
 * @param {object} user
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @param {object} pullRequestData
 */
async function setPullRequestStatus(user, owner, repo, pullNumber, pullRequestData) {
  try {
    const sha = await getLatestCommitSha(user, owner, repo, pullNumber);
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

    await setCommitStatus(user, owner, repo, sha, state, targetUrl, description, 'World driven');
  } catch (error) {
    console.error(`Failed to set status for PR ${owner}/${repo}#${pullNumber}:`, error.message);
  }
}

/**
 * Process a pull request and update its status
 * @param {object} user
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @returns {object} Pull request data
 */
async function processPullRequest(user, owner, repo, pullNumber) {
  console.log(`Processing PR ${owner}/${repo}#${pullNumber} from webhook`);
  
  const pullRequestData = await getPullRequestData(user, owner, repo, pullNumber);
  await setPullRequestStatus(user, owner, repo, pullNumber, pullRequestData);
  
  return pullRequestData;
}

/**
 * Handle pull_request webhook events (opened, synchronize, etc.)
 */
export async function handlePullRequestWebhook(data) {
  const { action, pull_request: pullRequest, repository } = data;
  
  console.log(`Webhook: pull_request ${action} for ${repository.full_name}#${pullRequest.number}`);

  // Find configured repository
  const [owner, repo] = repository.full_name.split('/');
  const dbRepository = await Repository.findByOwnerAndRepo(owner, repo);
  
  if (!dbRepository || !dbRepository.configured) {
    console.log(`Repository ${repository.full_name} not configured, ignoring webhook`);
    return { info: 'Repository not configured' };
  }

  // Find user for this repository
  const user = await User.findById(dbRepository.userId);
  if (!user) {
    console.error(`User not found for repository ${repository.full_name}`);
    return { error: 'User not found' };
  }

  try {
    if (action === 'opened') {
      const pullRequestData = await processPullRequest(user, owner, repo, pullRequest.number);
      
      const daysToMerge = Math.ceil(pullRequestData.times.daysToMerge / 86400);
      const comment = `This pull request will be automatically merged by [worlddriven](https://www.worlddriven.org) in ${daysToMerge} day(s).
The start date is based on the latest Commit date / Pull Request created date / (force) Push date.
The time to merge is ${Math.round(pullRequestData.times.totalMergeTime / (24 * 60 * 60))} days.
Check the \`worlddriven\` status check or the [dashboard](https://www.worlddriven.org/${owner}/${repo}/pull/${pullRequest.number}) for actual stats.

To speed up or delay the merge review the pull request:
1. ![Files changed](https://www.worlddriven.org/static/images/github-files-changed.png)
2. ![Review changes](https://www.worlddriven.org/static/images/github-review-changes.png)

- Speed up: ![Approve](https://www.worlddriven.org/static/images/github-approve.png)
- Delay or stop: ![Request changes](https://www.worlddriven.org/static/images/github-request-changes.png)`;

      await createIssueComment(user, owner, repo, pullRequest.number, comment);
      
    } else if (action === 'synchronize') {
      const pullRequestData = await processPullRequest(user, owner, repo, pullRequest.number);
      
      const daysToMerge = Math.ceil(pullRequestData.times.daysToMerge / 86400);
      const comment = `The branch of this pull request was updated so the auto-merge time has been reset.

It will be automatically merged by [worlddriven](https://www.worlddriven.org) in ${daysToMerge} day(s).
Check the \`worlddriven\` status check or the [dashboard](https://www.worlddriven.org/${owner}/${repo}/pull/${pullRequest.number}) for actual stats.`;

      await createIssueComment(user, owner, repo, pullRequest.number, comment);
      
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

  console.log(`Webhook: pull_request_review ${review.state} for ${repository.full_name}#${pullRequest.number} by ${review.user.login}`);

  // Find configured repository
  const [owner, repo] = repository.full_name.split('/');
  const dbRepository = await Repository.findByOwnerAndRepo(owner, repo);
  
  if (!dbRepository || !dbRepository.configured) {
    console.log(`Repository ${repository.full_name} not configured, ignoring webhook`);
    return { info: 'Repository not configured' };
  }

  // Find user for this repository
  const user = await User.findById(dbRepository.userId);
  if (!user) {
    console.error(`User not found for repository ${repository.full_name}`);
    return { error: 'User not found' };
  }

  try {
    const pullRequestData = await processPullRequest(user, owner, repo, pullRequest.number);
    
    const daysToMerge = Math.ceil(pullRequestData.times.daysToMerge / 86400);
    const comment = `Thank you for the review.
This pull request will be automatically merged by [worlddriven](https://www.worlddriven.org) in ${daysToMerge} day(s). Current votes: ${pullRequestData.stats.votes}/${pullRequestData.stats.votesTotal}.

Check the \`worlddriven\` status checks or the [dashboard](https://www.worlddriven.org/${owner}/${repo}/pull/${pullRequest.number}) for actual stats.`;

    await createIssueComment(user, owner, repo, pullRequest.number, comment);
    
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