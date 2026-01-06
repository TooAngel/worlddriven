/**
 * Handle webhooks from the worlddriven-migrate GitHub App
 *
 * This app enables repository transfer to the worlddriven org.
 * When a user installs the migrate app on their repo, we:
 * 1. Check if there's an approved migration PR in the documentation repo
 * 2. Transfer the repository to worlddriven org
 * 3. Comment on the PR and trigger CI re-run
 */

import { getInstallationAccessToken } from './githubApp.js';

const GITHUB_API_BASE = 'https://api.github.com';
const DOCUMENTATION_REPO = 'worlddriven/documentation';
const TARGET_ORG = 'worlddriven';

/**
 * Handle installation or installation_repositories webhook from worlddriven-migrate app
 * @param {object} payload - Webhook payload
 * @param {string} eventType - The GitHub event type
 */
export async function handleMigrateInstallationWebhook(payload, eventType) {
  const { action, repositories_added, repositories, installation } = payload;

  // Handle both event types:
  // - installation (action: created) -> repositories array
  // - installation_repositories (action: added) -> repositories_added array
  let repos = [];

  if (
    eventType === 'installation' &&
    action === 'created' &&
    repositories?.length
  ) {
    repos = repositories;
    console.log(
      `[Migration] New installation with ${repos.length} repository(ies)`
    );
  } else if (
    eventType === 'installation_repositories' &&
    action === 'added' &&
    repositories_added?.length
  ) {
    repos = repositories_added;
    console.log(
      `[Migration] Repositories added to existing installation: ${repos.length}`
    );
  } else {
    console.log(
      `[Migration] Ignoring: event=${eventType}, action=${action}, repos=${repositories?.length || repositories_added?.length || 0}`
    );
    return { info: 'No action needed' };
  }

  const results = [];

  for (const repo of repos) {
    const repoFullName = repo.full_name;
    console.log(`[Migration] Processing: ${repoFullName}`);

    try {
      const result = await processRepoMigration(repoFullName, installation.id);
      results.push({ repo: repoFullName, ...result });
    } catch (error) {
      console.error(
        `[Migration] Error processing ${repoFullName}:`,
        error.message
      );
      results.push({ repo: repoFullName, error: error.message });
    }
  }

  return { processed: results };
}

/**
 * Process a single repository migration
 * @param {string} repoFullName - Full name of the repository (owner/repo)
 * @param {number} installationId - GitHub App installation ID
 */
async function processRepoMigration(repoFullName, installationId) {
  // 1. Find approved migration PR in documentation repo
  const pr = await findApprovedMigrationPR(repoFullName);

  if (!pr) {
    console.log(`[Migration] No approved PR found for ${repoFullName}`);
    await commentOnRepository(
      repoFullName,
      installationId,
      `## Migration Status

No approved migration PR found in [worlddriven/documentation](https://github.com/worlddriven/documentation).

**To migrate this repository:**
1. Create a PR adding this repository to \`REPOSITORIES.md\`
2. Wait for community approval through worlddriven voting
3. The transfer will happen automatically once approved

[Create migration PR →](https://github.com/worlddriven/documentation/edit/main/REPOSITORIES.md)`
    );
    return { status: 'no_approved_pr' };
  }

  console.log(
    `[Migration] Found approved PR #${pr.number} for ${repoFullName}`
  );

  // 2. Transfer repository to worlddriven org
  const transferResult = await transferRepository(repoFullName, installationId);

  if (!transferResult.success) {
    console.error(
      `[Migration] Transfer failed for ${repoFullName}:`,
      transferResult.error
    );
    await commentOnPR(
      pr.number,
      `## Migration Failed

Failed to transfer \`${repoFullName}\` to worlddriven organization.

**Error:** ${transferResult.error}

Please check the repository settings and try again.`
    );
    return { status: 'transfer_failed', error: transferResult.error };
  }

  console.log(`[Migration] Successfully transferred ${repoFullName}`);

  // 3. Comment on PR and trigger CI re-run
  await commentOnPR(
    pr.number,
    `## Migration Complete

Repository \`${repoFullName}\` has been transferred to the worlddriven organization.

Re-running drift detection checks...`
  );

  // 4. Trigger CI re-run
  await triggerPRChecks(pr.number, pr.head.sha);

  return { status: 'success', prNumber: pr.number };
}

/**
 * Find an approved migration PR in the documentation repo that references the given repository
 * @param {string} repoFullName - Full name of repository to find PR for
 * @returns {object|null} PR object if found and approved, null otherwise
 */
async function findApprovedMigrationPR(repoFullName) {
  const token = process.env.WORLDDRIVEN_GITHUB_TOKEN;

  if (!token) {
    console.error('[Migration] No WORLDDRIVEN_GITHUB_TOKEN configured');
    return null;
  }

  try {
    // Get open PRs in documentation repo
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${DOCUMENTATION_REPO}/pulls?state=open`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (!response.ok) {
      console.error(`[Migration] Failed to fetch PRs: ${response.status}`);
      return null;
    }

    const prs = await response.json();

    for (const pr of prs) {
      // Check if PR modifies REPOSITORIES.md
      const filesResponse = await fetch(
        `${GITHUB_API_BASE}/repos/${DOCUMENTATION_REPO}/pulls/${pr.number}/files`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
          },
        }
      );

      if (!filesResponse.ok) continue;

      const files = await filesResponse.json();
      const modifiesRepoFile = files.some(
        f => f.filename === 'REPOSITORIES.md'
      );

      if (!modifiesRepoFile) continue;

      // Check if PR diff contains the repository name
      const diffResponse = await fetch(
        `${GITHUB_API_BASE}/repos/${DOCUMENTATION_REPO}/pulls/${pr.number}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3.diff',
          },
        }
      );

      if (!diffResponse.ok) continue;

      const diff = await diffResponse.text();
      if (!diff.includes(repoFullName)) continue;

      // Found a PR that references this repo - check if it's approved
      // For worlddriven, "approved" means the voting coefficient is positive
      // and the merge date has been reached, OR has explicit approvals
      const isApproved = await checkPRApprovalStatus(pr.number);

      if (isApproved) {
        return pr;
      }
    }

    return null;
  } catch (error) {
    console.error('[Migration] Error finding migration PR:', error.message);
    return null;
  }
}

/**
 * Check if a PR has been approved (either by worlddriven voting or reviews)
 * @param {number} prNumber - PR number
 * @returns {boolean} True if approved
 */
async function checkPRApprovalStatus(prNumber) {
  const token = process.env.WORLDDRIVEN_GITHUB_TOKEN;

  try {
    // Check for approving reviews
    const reviewsResponse = await fetch(
      `${GITHUB_API_BASE}/repos/${DOCUMENTATION_REPO}/pulls/${prNumber}/reviews`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (reviewsResponse.ok) {
      const reviews = await reviewsResponse.json();
      const hasApproval = reviews.some(r => r.state === 'APPROVED');
      if (hasApproval) {
        console.log(`[Migration] PR #${prNumber} has approving review`);
        return true;
      }
    }

    // Check worlddriven status (commit status shows voting coefficient)
    const prResponse = await fetch(
      `${GITHUB_API_BASE}/repos/${DOCUMENTATION_REPO}/pulls/${prNumber}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (!prResponse.ok) return false;

    const pr = await prResponse.json();
    const sha = pr.head.sha;

    const statusResponse = await fetch(
      `${GITHUB_API_BASE}/repos/${DOCUMENTATION_REPO}/commits/${sha}/status`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (statusResponse.ok) {
      const status = await statusResponse.json();
      const worlddrivenStatus = status.statuses?.find(
        s => s.context === 'World driven'
      );

      if (worlddrivenStatus?.state === 'success') {
        console.log(
          `[Migration] PR #${prNumber} has successful worlddriven status`
        );
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('[Migration] Error checking PR approval:', error.message);
    return false;
  }
}

/**
 * Transfer a repository to the worlddriven organization
 * @param {string} repoFullName - Full name of repository (owner/repo)
 * @param {number} installationId - GitHub App installation ID
 * @returns {object} Result with success flag and optional error
 */
async function transferRepository(repoFullName, installationId) {
  try {
    const token = await getInstallationAccessToken(
      installationId,
      process.env.MIGRATE_APP_ID,
      process.env.MIGRATE_APP_PRIVATE_KEY
    );

    const [owner, repo] = repoFullName.split('/');

    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/transfer`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          new_owner: TARGET_ORG,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        error: error.message || `HTTP ${response.status}`,
      };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Comment on the source repository (before transfer)
 * @param {string} repoFullName - Full name of repository
 * @param {number} installationId - GitHub App installation ID
 * @param {string} body - Comment body
 */
async function commentOnRepository(repoFullName, installationId, body) {
  try {
    const token = await getInstallationAccessToken(
      installationId,
      process.env.MIGRATE_APP_ID,
      process.env.MIGRATE_APP_PRIVATE_KEY
    );

    // Create an issue to communicate with the user
    const [owner, repo] = repoFullName.split('/');

    await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'WorldDriven Migration Status',
        body,
      }),
    });
  } catch (error) {
    console.error(
      '[Migration] Failed to comment on repository:',
      error.message
    );
  }
}

/**
 * Comment on a PR in the documentation repo
 * @param {number} prNumber - PR number
 * @param {string} body - Comment body
 */
async function commentOnPR(prNumber, body) {
  const token = process.env.WORLDDRIVEN_GITHUB_TOKEN;

  if (!token) return;

  try {
    await fetch(
      `${GITHUB_API_BASE}/repos/${DOCUMENTATION_REPO}/issues/${prNumber}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body }),
      }
    );
  } catch (error) {
    console.error('[Migration] Failed to comment on PR:', error.message);
  }
}

/**
 * Trigger CI re-run for a PR
 * @param {number} prNumber - PR number
 * @param {string} sha - Commit SHA
 */
async function triggerPRChecks(prNumber, sha) {
  const token = process.env.WORLDDRIVEN_GITHUB_TOKEN;

  if (!token) return;

  try {
    // Find failed workflow runs for this SHA and re-run them
    const runsResponse = await fetch(
      `${GITHUB_API_BASE}/repos/${DOCUMENTATION_REPO}/actions/runs?head_sha=${sha}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (!runsResponse.ok) return;

    const runs = await runsResponse.json();

    for (const run of runs.workflow_runs || []) {
      if (run.status === 'completed' && run.conclusion !== 'success') {
        // Re-run the workflow
        const rerunResponse = await fetch(
          `${GITHUB_API_BASE}/repos/${DOCUMENTATION_REPO}/actions/runs/${run.id}/rerun`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
            },
          }
        );

        if (rerunResponse.ok || rerunResponse.status === 201) {
          console.log(
            `[Migration] Re-triggered workflow run ${run.id} for PR #${prNumber}`
          );
        }
      }
    }
  } catch (error) {
    console.error('[Migration] Failed to trigger PR checks:', error.message);
  }
}
