import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

// Installation-level client for repository operations
export async function getInstallationOctokit(installationId) {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
      installationId: parseInt(installationId),
    },
  });
}

export async function getPullRequestDataApp(installationId, owner, repo, number) {
  const octokit = await getInstallationOctokit(installationId);

  try {
    // Get pull request details
    const { data: pull } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: number,
    });

    // Get contributors
    const { data: contributorsData } = await octokit.rest.repos.listContributors({
      owner,
      repo,
    });

    const contributors = contributorsData.map(contributor => ({
      name: contributor.login,
      commits: contributor.contributions,
      reviewValue: 0,
      timeValue: '',
    }));

    // Get reviews
    const { data: reviews } = await octokit.rest.pulls.listReviews({
      owner,
      repo,
      pull_number: number,
    });

    // Process reviews to set reviewValue
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

    // Set review value for PR author
    const contributor = contributors.find(
      contributor => contributor.name === pull.user.login
    );
    if (contributor) {
      contributor.reviewValue = 1;
    }

    // Calculate voting metrics
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

    // Get commits for date analysis
    const { data: commits } = await octokit.rest.pulls.listCommits({
      owner,
      repo,
      pull_number: number,
    });

    // Get issue events for date analysis
    const { data: events } = await octokit.rest.issues.listEvents({
      owner,
      repo,
      issue_number: number,
    });

    // Calculate dates
    const createdAt = new Date(pull.created_at).getTime();
    let push = createdAt;
    let commit = createdAt;
    let lastDraft = createdAt;

    if (commits.length > 0) {
      commit = Math.max(
        ...commits.map(c => new Date(c.commit.committer.date).getTime())
      );
      push = commit;
    }

    for (const event of events) {
      if (event.event === 'ready_for_review') {
        lastDraft = new Date(event.created_at).getTime();
      }
    }

    const dates = {
      push: push,
      commit: commit,
      lastDraft: lastDraft,
      created: createdAt,
      max: Math.max(push, commit, lastDraft, createdAt),
    };

    const age = (new Date().getTime() - dates.max) / 1000;

    return {
      pull: pull,
      contributors: contributors,
      votes: votes,
      votesTotal: votesTotal,
      coefficient: coefficient,
      dates: dates,
      age: age,
    };
  } catch (error) {
    console.error(
      `❌ Failed to get pull request data for ${owner}/${repo}#${number}:`,
      error.message
    );
    throw error;
  }
}