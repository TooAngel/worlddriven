// Using native fetch API

/**
 * getPullRequests
 *
 * @param {object} user
 * @param {string} owner
 * @param {string} repo
 * @return {void}
 */
export async function getPullRequests(user, owner, repo) {
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
 * mergePullRequest
 *
 * @param {object} user
 * @param {string} owner
 * @param {string} repo
 * @param {number} number
 * @return {void}
 */
export async function mergePullRequest(user, owner, repo, number) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/merge`;

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${user.githubAccessToken}`,
      },
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
 * createIssueComment
 *
 * @param {object} user
 * @param {string} owner
 * @param {string} repo
 * @param {number} number
 * @param {string} comment
 * @return {void}
 */
export async function createIssueComment(user, owner, repo, number, comment) {
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
 * setCommitStatus
 *
 * @param {object} user
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
  user,
  owner,
  repo,
  sha,
  state,
  targetUrl,
  description,
  context = 'World driven'
) {
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
 * getLatestCommitSha
 *
 * @param {object} user
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @return {string} commit SHA
 */
export async function getLatestCommitSha(user, owner, repo, pullNumber) {
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
 * createWebhook - Create a GitHub webhook for a repository
 *
 * @param {object} user
 * @param {string} owner
 * @param {string} repo
 * @param {string} webhookUrl - The URL to receive webhooks
 * @return {object} webhook response
 */
export async function createWebhook(user, owner, repo, webhookUrl) {
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
 * deleteWebhook - Delete GitHub webhooks for a repository
 *
 * @param {object} user
 * @param {string} owner
 * @param {string} repo
 * @param {string} webhookUrl - The webhook URL to delete
 * @return {void}
 */
export async function deleteWebhook(user, owner, repo, webhookUrl) {
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
