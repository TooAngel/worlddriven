/**
 * Process pending repository invitations for worlddrivenbot
 * Accepts invitations automatically to enable migration workflow
 * After accepting, triggers CI re-run on related PRs in documentation repo
 */

const GITHUB_API_BASE = 'https://api.github.com';
const DOCUMENTATION_REPO = 'worlddriven/documentation';

export async function acceptRepositoryInvitations() {
  const token = process.env.WORLDDRIVEN_GITHUB_TOKEN;

  if (!token) {
    console.log(
      '[Invitations] No WORLDDRIVEN_GITHUB_TOKEN configured, skipping'
    );
    return { accepted: 0, failed: 0 };
  }

  const result = { accepted: 0, failed: 0, acceptedRepos: [] };

  try {
    // List pending invitations
    const listResponse = await fetch(
      `${GITHUB_API_BASE}/user/repository_invitations`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (!listResponse.ok) {
      console.error(`[Invitations] Failed to list: ${listResponse.status}`);
      return result;
    }

    const invitations = await listResponse.json();

    if (invitations.length === 0) {
      return result;
    }

    console.log(
      `[Invitations] Found ${invitations.length} pending invitation(s)`
    );

    // Accept each invitation
    for (const invitation of invitations) {
      const repoFullName = invitation.repository.full_name;

      const acceptResponse = await fetch(
        `${GITHUB_API_BASE}/user/repository_invitations/${invitation.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
          },
        }
      );

      if (acceptResponse.ok || acceptResponse.status === 204) {
        result.accepted++;
        result.acceptedRepos.push(repoFullName);
        console.log(`[Invitations] ✅ Accepted: ${repoFullName}`);
      } else {
        result.failed++;
        console.error(
          `[Invitations] ❌ Failed: ${repoFullName} (${acceptResponse.status})`
        );
      }
    }

    // Trigger CI re-run for related PRs in documentation repo
    if (result.acceptedRepos.length > 0) {
      await triggerDocumentationPRChecks(token, result.acceptedRepos);
    }
  } catch (error) {
    console.error(`[Invitations] Error: ${error.message}`);
  }

  return result;
}

/**
 * Find open PRs in documentation repo that reference the accepted repos
 * and trigger a CI re-run by adding a comment and re-requesting checks
 */
async function triggerDocumentationPRChecks(token, acceptedRepos) {
  try {
    // Get open PRs in documentation repo
    const prsResponse = await fetch(
      `${GITHUB_API_BASE}/repos/${DOCUMENTATION_REPO}/pulls?state=open`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (!prsResponse.ok) {
      console.error(
        `[Invitations] Failed to fetch documentation PRs: ${prsResponse.status}`
      );
      return;
    }

    const prs = await prsResponse.json();

    for (const pr of prs) {
      // Check if PR modifies REPOSITORIES.md and mentions any accepted repo
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

      // Check if any accepted repo is mentioned in PR diff
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
      const isRelated = acceptedRepos.some(repo => diff.includes(repo));

      if (isRelated) {
        console.log(`[Invitations] Triggering CI re-run for PR #${pr.number}`);

        // Post comment to indicate invitation was accepted
        await fetch(
          `${GITHUB_API_BASE}/repos/${DOCUMENTATION_REPO}/issues/${pr.number}/comments`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              body: `🤖 Invitation accepted for repository. Re-running drift detection...`,
            }),
          }
        );

        // Trigger workflow re-run by re-requesting check runs
        const checksResponse = await fetch(
          `${GITHUB_API_BASE}/repos/${DOCUMENTATION_REPO}/commits/${pr.head.sha}/check-runs`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
            },
          }
        );

        if (checksResponse.ok) {
          const checks = await checksResponse.json();
          for (const check of checks.check_runs || []) {
            // Re-run the check
            await fetch(
              `${GITHUB_API_BASE}/repos/${DOCUMENTATION_REPO}/check-runs/${check.id}/rerequest`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: 'application/vnd.github+json',
                },
              }
            );
          }
        }
      }
    }
  } catch (error) {
    console.error(`[Invitations] Error triggering PR checks: ${error.message}`);
  }
}
