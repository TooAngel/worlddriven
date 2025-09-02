import got from 'got';

/**
 * getContributors
 *
 * @param {object} user
 * @param {string} url
 */
async function getContributors(user, url) {
  const options = {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${user.githubAccessToken}`,
    },
    responseType: 'json',
  };
  try {
    const response = await got.get(url, options);
    const contributors = [];
    for (const contributor of response.body) {
      contributors.push({
        name: contributor.login,
        commits: contributor.contributions,
        reviewValue: 0,
        timeValue: '',
      });
    }
    return contributors;
  } catch (e) {
    console.log(e);
    console.log(e.response.body);
    console.log(options);
    console.log(url);
    throw e;
  }
}

/**
 * getCommits
 *
 * @param {object} user
 * @param {object} pull
 * @return {list}
 */
async function getCommits(user, pull) {
  const url = pull.commits_url;
  const options = {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${user.githubAccessToken}`,
    },
    responseType: 'json',
  };
  try {
    const response = await got.get(url, options);
    return response.body;
  } catch (e) {
    console.log(e);
    console.log(e.response.body);
    console.log(options);
    console.log(url);
    throw e;
  }
}

/**
 * getPullIssueEvents
 *
 * @param {object} user
 * @param {object} pull
 * @return {list}
 */
async function getPullIssueEvents(user, pull) {
  const url = `${pull.issue_url}/events`;
  const options = {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${user.githubAccessToken}`,
    },
    responseType: 'json',
  };
  try {
    const response = await got.get(url, options);
    return response.body;
  } catch (e) {
    console.log(e);
    console.log(e.response.body);
    console.log(options);
    console.log(url);
    throw e;
  }
}

/**
 * getBranchEvents
 *
 * @param {object} user
 * @param {object} pull
 * @return {list}
 */
async function getBranchEvents(user, pull) {
  const url = `${pull.head.repo.events_url}`;
  const options = {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${user.githubAccessToken}`,
    },
    responseType: 'json',
  };
  try {
    const response = await got.get(url, options);
    return response.body;
  } catch (e) {
    console.log(e);
    console.log(e.response.body);
    console.log(options);
    console.log(url);
    throw e;
  }
}

/**
 * getDates
 *
 * @param {object} user
 * @param {object} pull
 * @return {object}
 */
async function getDates(user, pull) {
  const createdAt = new Date(pull.created_at).getTime();
  const commits = await getCommits(user, pull);
  const commit = commits.reduce((total, current) => {
    return Math.max(new Date(total), new Date(current.commit.author.date));
  }, new Date('January 1, 1970 00:00:00 UTC'));
  const repoEvents = await getBranchEvents(user, pull);
  const push = repoEvents
    .reduce((total, current) => {
      if (current.type !== 'PushEvent') {
        return new Date(total);
      }
      return new Date(
        Math.max(
          new Date(total).getTime(),
          new Date(current.created_at).getTime()
        )
      );
    }, new Date('January 1, 1970 00:00:00 UTC'))
    .getTime();
  const pullIssueEvents = await getPullIssueEvents(user, pull);
  const lastDraft = pullIssueEvents
    .reduce((total, current) => {
      if (current.event !== 'ready_for_review') {
        return new Date(total);
      }
      return Math.max(new Date(total), new Date(current.created_at));
    }, new Date('January 1, 1970 00:00:00 UTC'))
    .getTime();
  return {
    push: push,
    commit: commit,
    lastDraft: lastDraft,
    created: createdAt,
    max: Math.max(push, commit, lastDraft, createdAt),
  };
}

/**
 * getPullRequest
 *
 * @param {object} user
 * @param {string} owner
 * @param {string} repo
 * @param {string} number
 */
async function getPullRequest(user, owner, repo, number) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`;
  const options = {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${user.githubAccessToken}`,
    },
    responseType: 'json',
  };
  try {
    const response = await got.get(url, options);
    return response.body;
  } catch (e) {
    console.log(e);
    console.log(e.response.body);
    console.log(options);
    console.log(url);
    throw e;
  }
}

/**
 * getReviews
 *
 * @param {object} user
 * @param {object} pull
 */
async function getReviews(user, pull) {
  const url = `${pull._links.self.href}/reviews`;
  const options = {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${user.githubAccessToken}`,
    },
    responseType: 'json',
  };
  try {
    const response = await got.get(url, options);
    return response.body;
  } catch (e) {
    console.log(e);
    // console.log(e.response.body);
    console.log(options);
    console.log(url);
    throw e;
  }
}

/**
 *
 * @param {object} user
 * @param {string} owner
 * @param {string} repo
 * @param {string} number
 */
export async function getPullRequestData(user, owner, repo, number) {
  const pull = await getPullRequest(user, owner, repo, number);
  const contributors = await getContributors(
    user,
    pull.head.repo.contributors_url
  );
  const reviews = await getReviews(user, pull);
  for (const review of reviews) {
    if (review.state === 'CHANGES_REQUESTED') {
      const contributor = contributors.find(
        contributor => contributor.name === review.user.login
      );
      contributor.reviewValue = -1;
    }
    if (review.state === 'APPROVED') {
      const contributor = contributors.find(
        contributor => contributor.name === review.user.login
      );
      contributor.reviewValue = 1;
    }
  }
  const contributor = contributors.find(
    contributor => contributor.name === pull.user.login
  );
  if (contributor) {
    contributor.reviewValue = 1;
  }

  const votesTotal = contributors.reduce((total, current) => {
    return total + current.commits;
  }, 0);

  const votes = contributors.reduce((total, current) => {
    return total + current.commits * current.reviewValue;
  }, 0);
  let coefficient = 0;
  if (votesTotal) {
    coefficient = votes / votesTotal;
  }

  const dates = await getDates(user, pull);
  const age = (new Date().getTime() - dates.max) / 1000;

  const config = {
    baseMergeTimeInHours: 240,
    perCommitTimeInHours: 0,
    merge_method: 'squash',
  };

  const totalMergeTime =
    (config.baseMergeTimeInHours / 24 +
      (pull.commits * config.perCommitTimeInHours) / 24) *
    24 *
    60 *
    60;
  const mergeDuration = (1 - coefficient) * totalMergeTime;
  const daysToMerge = mergeDuration - age;

  for (const contributor of contributors) {
    contributor.timeValue =
      (contributor.commits / votesTotal) * totalMergeTime * 24 * 60 * 60;
  }

  const pullRequestData = {
    id: pull.id,
    title: pull.title,
    stats: {
      contributors: contributors,
      age: age,
      commits: pull.commits,
      votesTotal: votesTotal,
      votes: votes,
      coefficient: coefficient,
    },
    dates: dates,
    times: {
      daysToMerge: daysToMerge,
      mergeDuration: mergeDuration,
      totalMergeTime: totalMergeTime,
      mergeDate: (new Date(dates.max).getTime() + mergeDuration * 1000) / 1000,
    },
  };
  return pullRequestData;
}
