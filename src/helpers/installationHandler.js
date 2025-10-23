import { Repository } from '../database/models.js';
import { createWebhookApp, deleteWebhookApp } from './githubApp.js';

/**
 * Handle GitHub App installation webhook
 * @param {object} payload
 */
export async function handleInstallationWebhook(payload) {
  const { action, installation, repositories } = payload;

  if (action === 'created') {
    console.log(
      `GitHub App installed by ${installation.account.login} (ID: ${installation.id})`
    );

    // Auto-configure repositories if specific repos were selected
    if (repositories) {
      for (const repo of repositories) {
        const [owner, repoName] = repo.full_name.split('/');

        // Check if repository already exists (from PAT setup)
        const existingRepo = await Repository.findByOwnerAndRepo(
          owner,
          repoName
        );

        if (existingRepo) {
          // Migrate from PAT to GitHub App
          await Repository.update(existingRepo._id, {
            installationId: installation.id,
            // Keep userId for now during migration
          });
          console.log(`Migrated ${owner}/${repoName} to GitHub App`);
        } else {
          // Create new repository
          await Repository.create({
            owner,
            repo: repoName,
            installationId: installation.id,
            configured: true,
          });
          console.log(`Added ${owner}/${repoName} via GitHub App`);
        }

        // Create webhook for the repository
        try {
          await createWebhookApp(
            installation.id,
            owner,
            repoName,
            'https://www.worlddriven.org/github'
          );
        } catch (error) {
          console.error(
            `Failed to create webhook for ${owner}/${repoName}:`,
            error.message
          );
        }
      }
    }
  } else if (action === 'deleted') {
    console.log(
      `GitHub App uninstalled by ${installation.account.login} (ID: ${installation.id})`
    );

    // Disable repositories for this installation
    const repos = await Repository.findByInstallationId(installation.id);
    for (const repo of repos) {
      // Delete webhook before disabling
      try {
        await deleteWebhookApp(
          installation.id,
          repo.owner,
          repo.repo,
          'https://www.worlddriven.org/github'
        );
      } catch (error) {
        console.error(
          `Failed to delete webhook for ${repo.owner}/${repo.repo}:`,
          error.message
        );
      }

      await Repository.update(repo._id, {
        configured: false,
        installationId: null,
      });
      console.log(`Disabled ${repo.owner}/${repo.repo} (app uninstalled)`);
    }
  }
}

/**
 * Handle GitHub App installation repositories webhook
 * @param {object} payload
 */
export async function handleInstallationRepositoriesWebhook(payload) {
  const { action, installation, repositories_added, repositories_removed } =
    payload;

  if (action === 'added') {
    for (const repo of repositories_added) {
      const [owner, repoName] = repo.full_name.split('/');

      // Check if repository already exists
      const existingRepo = await Repository.findByOwnerAndRepo(owner, repoName);

      if (existingRepo) {
        // Update existing repository to use GitHub App
        await Repository.update(existingRepo._id, {
          installationId: installation.id,
          configured: true,
        });
        console.log(`Updated ${owner}/${repoName} to use GitHub App`);
      } else {
        // Create new repository
        await Repository.create({
          owner,
          repo: repoName,
          installationId: installation.id,
          configured: true,
        });
        console.log(`Added ${owner}/${repoName} to installation`);
      }

      // Create webhook for the repository
      try {
        await createWebhookApp(
          installation.id,
          owner,
          repoName,
          'https://www.worlddriven.org/github'
        );
      } catch (error) {
        console.error(
          `Failed to create webhook for ${owner}/${repoName}:`,
          error.message
        );
      }
    }
  } else if (action === 'removed') {
    for (const repo of repositories_removed) {
      const [owner, repoName] = repo.full_name.split('/');
      const existingRepo = await Repository.findByOwnerAndRepo(owner, repoName);
      if (existingRepo && existingRepo.installationId === installation.id) {
        // Delete webhook before removing from installation
        try {
          await deleteWebhookApp(
            installation.id,
            owner,
            repoName,
            'https://www.worlddriven.org/github'
          );
        } catch (error) {
          console.error(
            `Failed to delete webhook for ${owner}/${repoName}:`,
            error.message
          );
        }

        await Repository.update(existingRepo._id, {
          configured: false,
          installationId: null,
        });
        console.log(`Removed ${owner}/${repoName} from installation`);
      }
    }
  }
}
