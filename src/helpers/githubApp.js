import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

// App-level client for managing installations (reserved for future use)
// const appOctokit = new Octokit({
//   authStrategy: createAppAuth,
//   auth: {
//     appId: process.env.GITHUB_APP_ID,
//     privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
//   },
// });

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

// GitHub App API functions
export async function getPullRequestsApp(installationId, owner, repo) {
  const octokit = await getInstallationOctokit(installationId);
  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
  });

  return data.map(pull => ({
    id: pull.id,
    title: pull.title,
    number: pull.number,
  }));
}

export async function mergePullRequestApp(installationId, owner, repo, number) {
  const octokit = await getInstallationOctokit(installationId);
  try {
    return await octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: number,
    });
  } catch (error) {
    if (error.status === 405) return; // Cannot merge
    throw error;
  }
}

export async function setCommitStatusApp(
  installationId,
  owner,
  repo,
  sha,
  state,
  targetUrl,
  description,
  context = 'World driven'
) {
  const octokit = await getInstallationOctokit(installationId);
  try {
    const response = await octokit.rest.repos.createCommitStatus({
      owner,
      repo,
      sha,
      state,
      target_url: targetUrl,
      description,
      context,
    });
    console.log(
      `✅ Set status for ${owner}/${repo}@${sha}: ${state} - ${description}`
    );
    return response;
  } catch (error) {
    console.error(
      `❌ Failed to set status for ${owner}/${repo}@${sha}:`,
      error.message
    );
    throw error;
  }
}

export async function getLatestCommitShaApp(
  installationId,
  owner,
  repo,
  pullNumber
) {
  const octokit = await getInstallationOctokit(installationId);
  try {
    const { data: commits } = await octokit.rest.pulls.listCommits({
      owner,
      repo,
      pull_number: pullNumber,
    });

    if (commits.length === 0) {
      throw new Error('No commits found for pull request');
    }
    return commits[commits.length - 1].sha;
  } catch (error) {
    console.error(
      `❌ Failed to get commits for PR ${owner}/${repo}#${pullNumber}:`,
      error.message
    );
    throw error;
  }
}

export async function createIssueCommentApp(
  installationId,
  owner,
  repo,
  number,
  comment
) {
  const octokit = await getInstallationOctokit(installationId);
  try {
    return await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body: comment,
    });
  } catch (error) {
    console.error(
      `❌ Failed to create comment for ${owner}/${repo}#${number}:`,
      error.message
    );
    throw error;
  }
}

export async function createWebhookApp(
  installationId,
  owner,
  repo,
  webhookUrl
) {
  const octokit = await getInstallationOctokit(installationId);

  const webhookConfig = {
    url: webhookUrl,
    insecure_ssl: '0',
    content_type: 'json',
  };

  const events = ['pull_request', 'pull_request_review', 'push'];

  try {
    const response = await octokit.rest.repos.createWebhook({
      owner,
      repo,
      name: 'web',
      config: webhookConfig,
      events: events,
      active: true,
    });

    console.log(`✅ Created webhook for ${owner}/${repo} -> ${webhookUrl}`);
    return response.data;
  } catch (error) {
    // If webhook already exists, that's okay
    if (error.status === 422) {
      console.log(`Webhook already exists for ${owner}/${repo}`);
      return { info: 'Webhook already exists' };
    }
    console.error(
      `❌ Failed to create webhook for ${owner}/${repo}:`,
      error.message
    );
    throw error;
  }
}

export async function deleteWebhookApp(
  installationId,
  owner,
  repo,
  webhookUrl
) {
  const octokit = await getInstallationOctokit(installationId);

  try {
    // First, get all hooks
    const { data: hooks } = await octokit.rest.repos.listWebhooks({
      owner,
      repo,
    });

    // Find hooks that match our webhook URL
    for (const hook of hooks) {
      if (hook.config && hook.config.url === webhookUrl) {
        await octokit.rest.repos.deleteWebhook({
          owner,
          repo,
          hook_id: hook.id,
        });
        console.log(`✅ Deleted webhook ${hook.id} for ${owner}/${repo}`);
      }
    }
  } catch (error) {
    console.error(
      `❌ Failed to delete webhooks for ${owner}/${repo}:`,
      error.message
    );
  }
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
