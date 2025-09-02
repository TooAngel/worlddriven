import got from 'got';

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
  const options = {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${user.githubAccessToken}`,
    },
    responseType: 'json',
  };
  try {
    // TODO handle pagination
    const response = await got.get(url, options);
    const pulls = [];
    for (const pull of response.body) {
      pulls.push({
        id: pull.id,
        title: pull.title,
        number: pull.number,
      });
    }
    return pulls;
  } catch (e) {
    console.log(e);
    console.log(e.response.body);
    console.log(options);
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
  const options = {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${user.githubAccessToken}`,
    },
    responseType: 'json',
  };
  try {
    const response = await got.put(url, options);
    return response;
  } catch (e) {
    if (e.response.statusCode === 405) {
      return;
    }
    console.log(e);
    console.log(e.response.body);
    console.log(options);
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
  const options = {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${user.githubAccessToken}`,
    },
    body: {
      body: comment,
    },
    responseType: 'json',
  };
  try {
    const response = await got.post(url, options);
    return response;
  } catch (e) {
    console.log(e);
    console.log(e.response.body);
    console.log(options);
    return;
  }
}
