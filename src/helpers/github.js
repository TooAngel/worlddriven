// Using native fetch API
import {
  getPullRequestsApp,
  mergePullRequestApp,
  closePullRequestApp,
  setCommitStatusApp,
  getLatestCommitShaApp,
  createIssueCommentApp,
  listIssueCommentsApp,
  updateIssueCommentApp,
  createWebhookApp,
  deleteWebhookApp,
} from './githubApp.js';

/**
 * getPullRequests - Hybrid authentication (GitHub App or PAT)
 *
 * @param {object|number} userOrInstallationId - User object with githubAccessToken or installationId number
 * @param {string} owner
 * @param {string} repo
 * @return {void}
 */
export async function getPullRequests(userOrInstallationId, owner, repo) {
  // If it's a number, treat as installationId (GitHub App)
  if (
    typeof userOrInstallationId === 'number' ||
    (typeof userOrInstallationId === 'string' && !isNaN(userOrInstallationId))
  ) {
    return await getPullRequestsApp(
      parseInt(userOrInstallationId),
      owner,
      repo
    );
  }

  // Otherwise, use existing PAT logic
  const user = userOrInstallationId;
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open`;

  try {
    // TODO handle pagination
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${user.githubAccessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const pulls = [];
    for (const pull of data) {
      pulls.push({
        id: pull.id,
        title: pull.title,
        number: pull.number,
      });
    }
    return pulls;
  } catch (e) {
    console.log(e);
    throw e;
  }
}

/**
 * mergePullRequest - Hybrid authentication (GitHub App or PAT)
 *
 * @param {object|number} userOrInstallationId - User object with githubAccessToken or installationId number
 * @param {string} owner
 * @param {string} repo
 * @param {number} number
 * @param {string} mergeMethod - Merge method: 'merge', 'squash', or 'rebase' (default: 'squash')
 * @return {void}
 */
export async function mergePullRequest(
  userOrInstallationId,
  owner,
  repo,
  number,
  mergeMethod = 'squash'
) {
  // If it's a number, treat as installationId (GitHub App)
  if (
    typeof userOrInstallationId === 'number' ||
    (typeof userOrInstallationId === 'string' && !isNaN(userOrInstallationId))
  ) {
    return await mergePullRequestApp(
      parseInt(userOrInstallationId),
      owner,
      repo,
      number,
      mergeMethod
    );
  }

  // Otherwise, use existing PAT logic
  const user = userOrInstallationId;
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/merge`;

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${user.githubAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        merge_method: mergeMethod,
      }),
    });

    if (response.status === 405) {
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (e) {
    console.log(e);
    return;
  }
}

/**
 * closePullRequest - Hybrid authentication (GitHub App or PAT)
 *
 * @param {object|number} userOrInstallationId - User object with githubAccessToken or installationId number
 * @param {string} owner
 * @param {string} repo
 * @param {number} number
 * @return {void}
 */
export async function closePullRequest(
  userOrInstallationId,
  owner,
  repo,
  number
) {
  // If it's a number, treat as installationId (GitHub App)
  if (
    typeof userOrInstallationId === 'number' ||
    (typeof userOrInstallationId === 'string' && !isNaN(userOrInstallationId))
  ) {
    return await closePullRequestApp(
      parseInt(userOrInstallationId),
      owner,
      repo,
      number
    );
  }

  // Otherwise, use existing PAT logic
  const user = userOrInstallationId;
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`;

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${user.githubAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state: 'closed',
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (e) {
    console.log(e);
    return;
  }
}

/**
 * createIssueComment - Hybrid authentication (GitHub App or PAT)
 *
 * @param {object|number} userOrInstallationId - User object with githubAccessToken or installationId number
 * @param {string} owner
 * @param {string} repo
 * @param {number} number
 * @param {string} comment
 * @return {void}
 */
export async function createIssueComment(
  userOrInstallationId,
  owner,
  repo,
  number,
  comment
) {
  // If it's a number, treat as installationId (GitHub App)
  if (
    typeof userOrInstallationId === 'number' ||
    (typeof userOrInstallationId === 'string' && !isNaN(userOrInstallationId))
  ) {
    return await createIssueCommentApp(
      parseInt(userOrInstallationId),
      owner,
      repo,
      number,
      comment
    );
  }

  // Otherwise, use existing PAT logic
  const user = userOrInstallationId;
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${user.githubAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: comment,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (e) {
    console.log(e);
    return;
  }
}

/**
 * listIssueComments - List comments on a PR/issue
 *
 * @param {object|number} userOrInstallationId - User object with githubAccessToken or installationId number
 * @param {string} owner
 * @param {string} repo
 * @param {number} number
 * @return {Array} Array of comment objects
 */
export async function listIssueComments(
  userOrInstallationId,
  owner,
  repo,
  number
) {
  // If it's a number, treat as installationId (GitHub App)
  if (
    typeof userOrInstallationId === 'number' ||
    (typeof userOrInstallationId === 'string' && !isNaN(userOrInstallationId))
  ) {
    return await listIssueCommentsApp(
      parseInt(userOrInstallationId),
      owner,
      repo,
      number
    );
  }

  // Otherwise, use existing PAT logic
  const user = userOrInstallationId;
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${user.githubAccessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (e) {
    console.error('Failed to list issue comments:', e);
    throw e;
  }
}

/**
 * updateIssueComment - Update an existing comment
 *
 * @param {object|number} userOrInstallationId - User object with githubAccessToken or installationId number
 * @param {string} owner
 * @param {string} repo
 * @param {number} commentId
 * @param {string} comment
 * @return {object} Updated comment object
 */
export async function updateIssueComment(
  userOrInstallationId,
  owner,
  repo,
  commentId,
  comment
) {
  // If it's a number, treat as installationId (GitHub App)
  if (
    typeof userOrInstallationId === 'number' ||
    (typeof userOrInstallationId === 'string' && !isNaN(userOrInstallationId))
  ) {
    return await updateIssueCommentApp(
      parseInt(userOrInstallationId),
      owner,
      repo,
      commentId,
      comment
    );
  }

  // Otherwise, use existing PAT logic
  const user = userOrInstallationId;
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`;

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${user.githubAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: comment,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (e) {
    console.error('Failed to update issue comment:', e);
    throw e;
  }
}

/**
 * findWorlddrivenComment - Find existing worlddriven comment on PR
 *
 * @param {object|number} userOrInstallationId - User object with githubAccessToken or installationId number
 * @param {string} owner
 * @param {string} repo
 * @param {number} number
 * @return {object|null} Comment object if found, null otherwise
 */
export async function findWorlddrivenComment(
  userOrInstallationId,
  owner,
  repo,
  number
) {
  try {
    const comments = await listIssueComments(
      userOrInstallationId,
      owner,
      repo,
      number
    );

    // Look for comment containing worlddriven signature
    const worlddrivenComment = comments.find(
      comment =>
        comment.body && comment.body.includes('🤖 **Worlddriven Status**')
    );

    return worlddrivenComment || null;
  } catch (e) {
    console.error('Failed to find worlddriven comment:', e);
    return null;
  }
}

/**
 * setCommitStatus - Hybrid authentication (GitHub App or PAT)
 *
 * @param {object|number} userOrInstallationId - User object with githubAccessToken or installationId number
 * @param {string} owner
 * @param {string} repo
 * @param {string} sha - commit SHA
 * @param {string} state - pending, success, error, or failure
 * @param {string} targetUrl - URL for more details
 * @param {string} description - status description
 * @param {string} context - status context/name
 * @return {void}
 */
export async function setCommitStatus(
  userOrInstallationId,
  owner,
  repo,
  sha,
  state,
  targetUrl,
  description,
  context = 'World driven'
) {
  // If it's a number, treat as installationId (GitHub App)
  if (
    typeof userOrInstallationId === 'number' ||
    (typeof userOrInstallationId === 'string' && !isNaN(userOrInstallationId))
  ) {
    return await setCommitStatusApp(
      parseInt(userOrInstallationId),
      owner,
      repo,
      sha,
      state,
      targetUrl,
      description,
      context
    );
  }

  // Otherwise, use existing PAT logic
  const user = userOrInstallationId;
  const url = `https://api.github.com/repos/${owner}/${repo}/statuses/${sha}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${user.githubAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state,
        target_url: targetUrl,
        description,
        context,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(
      `✅ Set status for ${owner}/${repo}@${sha}: ${state} - ${description}`
    );
    return response;
  } catch (e) {
    console.error(
      `❌ Failed to set status for ${owner}/${repo}@${sha}:`,
      e.message
    );
    return;
  }
}

/**
 * getLatestCommitSha - Hybrid authentication (GitHub App or PAT)
 *
 * @param {object|number} userOrInstallationId - User object with githubAccessToken or installationId number
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @return {string} commit SHA
 */
export async function getLatestCommitSha(
  userOrInstallationId,
  owner,
  repo,
  pullNumber
) {
  // If it's a number, treat as installationId (GitHub App)
  if (
    typeof userOrInstallationId === 'number' ||
    (typeof userOrInstallationId === 'string' && !isNaN(userOrInstallationId))
  ) {
    return await getLatestCommitShaApp(
      parseInt(userOrInstallationId),
      owner,
      repo,
      pullNumber
    );
  }

  // Otherwise, use existing PAT logic
  const user = userOrInstallationId;
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/commits`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${user.githubAccessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const commits = await response.json();
    if (commits.length === 0) {
      throw new Error('No commits found for pull request');
    }
    return commits[commits.length - 1].sha;
  } catch (e) {
    console.error(
      `❌ Failed to get commits for PR ${owner}/${repo}#${pullNumber}:`,
      e.message
    );
    throw e;
  }
}

/**
 * createWebhook - Create a GitHub webhook for a repository - Hybrid authentication (GitHub App or PAT)
 *
 * @param {object|number} userOrInstallationId - User object with githubAccessToken or installationId number
 * @param {string} owner
 * @param {string} repo
 * @param {string} webhookUrl - The URL to receive webhooks
 * @return {object} webhook response
 */
export async function createWebhook(
  userOrInstallationId,
  owner,
  repo,
  webhookUrl
) {
  // If it's a number, treat as installationId (GitHub App)
  if (
    typeof userOrInstallationId === 'number' ||
    (typeof userOrInstallationId === 'string' && !isNaN(userOrInstallationId))
  ) {
    return await createWebhookApp(
      parseInt(userOrInstallationId),
      owner,
      repo,
      webhookUrl
    );
  }

  // Otherwise, use existing PAT logic
  const user = userOrInstallationId;
  const url = `https://api.github.com/repos/${owner}/${repo}/hooks`;

  const webhookConfig = {
    url: webhookUrl,
    insecure_ssl: '0',
    content_type: 'json',
  };

  const events = ['pull_request', 'pull_request_review', 'push'];

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${user.githubAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'web',
        config: webhookConfig,
        events: events,
        active: true,
      }),
    });

    if (!response.ok) {
      // If webhook already exists, that's okay
      if (response.status === 422) {
        console.log(`Webhook already exists for ${owner}/${repo}`);
        return { info: 'Webhook already exists' };
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ Created webhook for ${owner}/${repo} -> ${webhookUrl}`);
    return data;
  } catch (e) {
    console.error(
      `❌ Failed to create webhook for ${owner}/${repo}:`,
      e.message
    );
    throw e;
  }
}

/**
 * deleteWebhook - Delete GitHub webhooks for a repository - Hybrid authentication (GitHub App or PAT)
 *
 * @param {object|number} userOrInstallationId - User object with githubAccessToken or installationId number
 * @param {string} owner
 * @param {string} repo
 * @param {string} webhookUrl - The webhook URL to delete
 * @return {void}
 */
export async function deleteWebhook(
  userOrInstallationId,
  owner,
  repo,
  webhookUrl
) {
  // If it's a number, treat as installationId (GitHub App)
  if (
    typeof userOrInstallationId === 'number' ||
    (typeof userOrInstallationId === 'string' && !isNaN(userOrInstallationId))
  ) {
    return await deleteWebhookApp(
      parseInt(userOrInstallationId),
      owner,
      repo,
      webhookUrl
    );
  }

  // Otherwise, use existing PAT logic
  const user = userOrInstallationId;
  const url = `https://api.github.com/repos/${owner}/${repo}/hooks`;

  try {
    // First, get all hooks
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${user.githubAccessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const hooks = await response.json();

    // Find hooks that match our webhook URL
    for (const hook of hooks) {
      if (hook.config && hook.config.url === webhookUrl) {
        const deleteUrl = `https://api.github.com/repos/${owner}/${repo}/hooks/${hook.id}`;

        const deleteResponse = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `token ${user.githubAccessToken}`,
          },
        });

        if (deleteResponse.ok) {
          console.log(`✅ Deleted webhook ${hook.id} for ${owner}/${repo}`);
        } else {
          console.error(
            `❌ Failed to delete webhook ${hook.id} for ${owner}/${repo}`
          );
        }
      }
    }
  } catch (e) {
    console.error(
      `❌ Failed to delete webhooks for ${owner}/${repo}:`,
      e.message
    );
  }
}
