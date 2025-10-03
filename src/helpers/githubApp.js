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

export async function mergePullRequestApp(
  installationId,
  owner,
  repo,
  number,
  mergeMethod = 'squash'
) {
  const octokit = await getInstallationOctokit(installationId);
  try {
    return await octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: number,
      merge_method: mergeMethod,
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

// Note: getPullRequestDataApp has been replaced by the new Auth/GitHubClient architecture.
// All pull request data processing now goes through the GitHubClient abstraction layer
// which automatically handles authentication fallback between PAT and GitHub App methods.
