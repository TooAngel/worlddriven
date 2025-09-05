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
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${user.githubAccessToken}`,
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
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${user.githubAccessToken}`,
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
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${user.githubAccessToken}`,
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
export async function setCommitStatus(user, owner, repo, sha, state, targetUrl, description, context = 'World driven') {
  const url = `https://api.github.com/repos/${owner}/${repo}/statuses/${sha}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${user.githubAccessToken}`,
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

    console.log(`✅ Set status for ${owner}/${repo}@${sha}: ${state} - ${description}`);
    return response;
  } catch (e) {
    console.error(`❌ Failed to set status for ${owner}/${repo}@${sha}:`, e.message);
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
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${user.githubAccessToken}`,
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
    console.error(`❌ Failed to get commits for PR ${owner}/${repo}#${pullNumber}:`, e.message);
    throw e;
  }
}
