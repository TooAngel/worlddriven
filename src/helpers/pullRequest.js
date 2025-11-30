/**
 * Pull Request Data Processing
 *
 * This module contains pure business logic for processing GitHub pull request data.
 * All authentication concerns have been moved to the Auth and GitHubClient layers.
 *
 * KEY PRINCIPLES:
 * - Zero authentication logic - uses GitHubClient abstraction
 * - Pure data processing functions
 * - Same algorithms and business logic as before
 * - Easy to test with mock GitHubClient
 * - Clear separation of concerns
 */

import { fetchRepositoryConfig } from './config.js';

/**
 * Calculate time-based metrics from pull request events and commits
 *
 * @param {GitHubClient} githubClient - Authenticated GitHub client
 * @param {object} pull - Pull request object from GitHub API
 * @returns {Promise<object>} Date metrics object
 */
async function getDates(githubClient, pull) {
  const createdAt = new Date(pull.created_at).getTime();

  // Get commit dates
  const commits = await githubClient.getCommits(pull.commits_url);
  const commit = commits.reduce((total, current) => {
    // For force pushes, committer.date is more recent than author.date
    // We should use the latest of both to capture when the commit was actually pushed
    const authorDate = new Date(current.commit.author.date);
    const committerDate = new Date(current.commit.committer.date);
    const latestCommitDate = Math.max(authorDate, committerDate);
    return Math.max(new Date(total), latestCommitDate);
  }, new Date('January 1, 1970 00:00:00 UTC'));

  // Get push events - filter to only include pushes to this PR's branch
  // The GitHub Events API returns all repo events, so we must filter by ref
  // to avoid other branch pushes (like merges to master) affecting this PR's timer
  const prBranchRef = `refs/heads/${pull.head.ref}`;
  const repoEvents = await githubClient.getBranchEvents(
    pull.head.repo.events_url
  );
  const push = repoEvents
    .reduce((total, current) => {
      if (current.type !== 'PushEvent') {
        return new Date(total);
      }
      // Only consider push events to this PR's branch
      if (current.payload?.ref !== prBranchRef) {
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

  // Get pull request issue events
  const pullIssueEvents = await githubClient.getPullIssueEvents(pull.issue_url);
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
 * Process pull request reviews and calculate voting coefficients
 *
 * @param {Array} contributors - Array of contributor objects
 * @param {Array} reviews - Array of review objects from GitHub API
 * @param {object} pull - Pull request object
 * @returns {object} Processed voting data
 */
function processReviews(contributors, reviews, pull) {
  // Process reviews and update contributor review values
  for (const review of reviews) {
    if (review.state === 'CHANGES_REQUESTED') {
      const contributor = contributors.find(
        contributor => contributor.name === review.user.login
      );
      if (contributor) {
        contributor.reviewValue = -1;
      }
    }
    if (review.state === 'APPROVED') {
      const contributor = contributors.find(
        contributor => contributor.name === review.user.login
      );
      if (contributor) {
        contributor.reviewValue = 1;
      }
    }
  }

  // The pull request author gets a positive review value
  const contributor = contributors.find(
    contributor => contributor.name === pull.user.login
  );
  if (contributor) {
    contributor.reviewValue = 1;
  }

  // Calculate voting totals
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

  return { votesTotal, votes, coefficient };
}

/**
 * Calculate time-based metrics for pull request merging or closing
 *
 * @param {Array} contributors - Array of contributor objects
 * @param {object} dates - Date metrics object
 * @param {object} pull - Pull request object
 * @param {number} coefficient - Voting coefficient
 * @param {object} config - Repository configuration from .worlddriven.ini
 * @returns {object} Time metrics object
 */
function calculateTimeMetrics(contributors, dates, pull, coefficient, config) {
  const age = (new Date().getTime() - dates.max) / 1000;

  // Calculate individual contributor time values (for merge path)
  const votesTotal = contributors.reduce((total, current) => {
    return total + current.commits;
  }, 0);

  if (coefficient >= 0) {
    // MERGE PATH: Positive or neutral coefficient
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
        (contributor.commits / votesTotal) * totalMergeTime;
    }

    return {
      action: 'merge',
      age,
      daysToMerge,
      mergeDuration,
      totalMergeTime,
      mergeDate: (new Date(dates.max).getTime() + mergeDuration * 1000) / 1000,
    };
  } else {
    // CLOSE PATH: Negative coefficient
    const totalCloseTime = (config.baseCloseTimeInHours / 24) * 24 * 60 * 60;

    const closeDuration = (1 + coefficient) * totalCloseTime;
    const daysToClose = closeDuration - age;

    // Set contributor time values to 0 for close path (not applicable)
    for (const contributor of contributors) {
      contributor.timeValue = 0;
    }

    return {
      action: 'close',
      age,
      daysToClose,
      closeDuration,
      totalCloseTime,
      closeDate: (new Date(dates.max).getTime() + closeDuration * 1000) / 1000,
    };
  }
}

/**
 * Get comprehensive pull request data with all metrics
 *
 * This is the main function that orchestrates all the data gathering and processing.
 * It uses the GitHubClient to fetch data and applies business logic to calculate
 * voting coefficients, time metrics, and other pull request analytics.
 *
 * @param {GitHubClient} githubClient - Authenticated GitHub client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string|number} number - Pull request number
 * @returns {Promise<object>} Complete pull request data object
 */
export async function getPullRequestData(githubClient, owner, repo, number) {
  // Fetch repository configuration from .worlddriven.ini
  const config = await fetchRepositoryConfig(githubClient, owner, repo);

  // Fetch all required data from GitHub
  const pull = await githubClient.getPullRequest(owner, repo, number);
  const contributors = await githubClient.getContributors(
    pull.base.repo.contributors_url
  );
  const reviews = await githubClient.getReviews(
    `${pull._links.self.href}/reviews`
  );

  // Process reviews and calculate voting metrics
  const { votesTotal, votes, coefficient } = processReviews(
    contributors,
    reviews,
    pull
  );

  // Calculate date-based metrics
  const dates = await getDates(githubClient, pull);

  // Calculate time-based metrics
  const timeMetrics = calculateTimeMetrics(
    contributors,
    dates,
    pull,
    coefficient,
    config
  );

  // Assemble the complete pull request data object
  const pullRequestData = {
    id: pull.id,
    title: pull.title,
    org: owner,
    repo: repo,
    number: parseInt(number),
    state: pull.state,
    config: config,
    stats: {
      contributors: contributors,
      age: timeMetrics.age,
      commits: pull.commits,
      votesTotal: votesTotal,
      votes: votes,
      coefficient: coefficient,
    },
    dates: dates,
    times: timeMetrics,
  };

  return pullRequestData;
}
