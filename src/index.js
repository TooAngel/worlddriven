import express from 'express';
// Using native fetch API
import session from 'express-session';
import MongoStore from 'connect-mongo';
import { createServer } from 'vite';
import fs from 'fs';

import { client } from './database/database.js';
import { User, Repository } from './database/models.js';
import cron from 'node-cron';
import { processPullRequests } from './helpers/pullRequestProcessor.js';
import {
  getPullRequests,
  createWebhook,
  deleteWebhook,
} from './helpers/github.js';
import { getPullRequestData } from './helpers/pullRequest.js';
import { Auth } from './helpers/auth.js';
import { GitHubClient } from './helpers/github-client.js';
import {
  handlePullRequestWebhook,
  handlePullRequestReviewWebhook,
  handlePushWebhook,
} from './helpers/webhookHandler.js';
import {
  handleInstallationWebhook,
  handleInstallationRepositoriesWebhook,
} from './helpers/installationHandler.js';
import { removePatAuthentication } from '../scripts/remove-pat-auth.js';
import { removeConfiguredField } from '../scripts/remove-configured-field.js';
import { migrateDatabase as migrateUserGithubIds } from '../scripts/migrate-user-github-ids.js';

const mongoSessionStore = MongoStore.create({
  clientPromise: client.connect(),
  dbName: 'worlddriven',
  touchAfter: 24 * 3600, // lazy session update
});

const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  // Run database migrations on startup
  try {
    await removePatAuthentication();
  } catch (error) {
    console.error(
      '[STARTUP] Failed to run PAT removal migration:',
      error.message
    );
    // Continue anyway - migration failure shouldn't prevent app startup
  }

  try {
    await removeConfiguredField();
  } catch (error) {
    console.error(
      '[STARTUP] Failed to run configured field removal migration:',
      error.message
    );
    // Continue anyway - migration failure shouldn't prevent app startup
  }

  try {
    await migrateUserGithubIds();
  } catch (error) {
    console.error(
      '[STARTUP] Failed to run user GitHub ID migration:',
      error.message
    );
    // Continue anyway - migration failure shouldn't prevent app startup
  }

  const app = express();

  // Setup Vite middleware for development
  /** @type {import('vite').ViteDevServer} */

  let vite;
  if (!isProduction) {
    vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
  }

  const sess = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: mongoSessionStore,
    cookie: {},
    name: 'session',
  };

  if (app.get('env') === 'production') {
    app.set('trust proxy', 2); // trust first 2 proxies
    // Force secure cookies even though Express thinks connection is HTTP due to
    // 2-level proxy setup. Browser correctly handles secure flag since external
    // connection is HTTPS via www.worlddriven.org
    // sess.cookie.secure = true;
  }

  app.use(express.json());
  app.use(session(sess));

  // Static file serving
  app.use(express.static('./static'));
  if (isProduction) {
    app.use('/assets', express.static('./dist/assets'));
  }

  // API and static routes (keep these as-is for now, HTML serving handled at bottom)

  // Properly define favicon to not need this route
  app.get('/favicon.ico', function (req, res) {
    res.sendFile('./static/images/favicon.png', { root: '.' });
  });

  app.get('/imprint', function (req, res) {
    res.sendFile('./static/imprint.html', { root: '.' });
  });

  app.get('/privacyPolicy', function (req, res) {
    res.sendFile('./static/privacyPolicy.html', { root: '.' });
  });

  app.get('/install-app', function (req, res) {
    // Redirect to GitHub App installation page
    const appName = process.env.GITHUB_APP_NAME || 'world-driven';
    const installUrl = `https://github.com/apps/${appName}/installations/new`;
    res.redirect(installUrl);
  });

  app.get('/login', function (req, res) {
    if (req.session.userId) {
      res.redirect('/dashboard');
    } else {
      // TODO use `code`, too (https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps)
      const redirectUri = isProduction
        ? `https://${process.env.DOMAIN || req.get('host')}/github-callback`
        : 'http://localhost:3000/github-callback';
      res.redirect(
        `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=public_repo,read:org,admin:repo_hook`
      );
    }
  });

  app.get('/github-callback', async function (req, res) {
    const url = 'https://github.com/login/oauth/access_token';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code: req.query.code,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.access_token) {
        return res.redirect('/');
      }

      // Fetch GitHub user info to get the user ID
      const githubUserResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!githubUserResponse.ok) {
        console.error(
          'Failed to fetch GitHub user info:',
          githubUserResponse.status,
          githubUserResponse.statusText
        );
        return res.redirect('/');
      }

      const githubUser = await githubUserResponse.json();
      if (!githubUser.id) {
        console.error('GitHub user response missing ID');
        return res.redirect('/');
      }

      // Find user by GitHub user ID
      let user = await User.findByGithubUserId(githubUser.id);
      if (user) {
        // Update existing user's access token
        user = await User.update(user._id, {
          githubAccessToken: data.access_token,
        });
      } else {
        // Create new user with GitHub user ID and access token
        user = await User.create({
          githubUserId: githubUser.id,
          githubAccessToken: data.access_token,
        });
      }
      req.session.userId = user._id.toString();
      res.redirect('/dashboard');
    } catch (e) {
      console.error('GitHub OAuth error:', e);
      res.redirect('/');
    }
  });

  app.get('/v1/user', async function (req, res) {
    if (!req.session.userId) {
      return res.status(401).end();
    }
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(401).end();
    }
    const url = 'https://api.github.com/user';

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `token ${user.githubAccessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const userData = await response.json();
      const data = {
        name: userData.name,
      };
      res.send(data);
    } catch (e) {
      console.log(e);
      res.status(503).end();
    }
  });

  app.get('/v1/repositories', async function (req, res) {
    if (!req.session.userId) {
      return res.status(401).end();
    }
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(401).end();
    }
    const url = 'https://api.github.com/user/repos?type=public&per_page=100';

    try {
      // TODO handle pagination
      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `token ${user.githubAccessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const repositories = [];
      for (const repository of data) {
        const [owner, repo] = repository.full_name.split('/');
        // Repository is configured if it exists in database
        const dbRepository = await Repository.findByOwnerAndRepo(owner, repo);
        const configured = dbRepository !== null;
        repositories.push({
          fullName: repository.full_name,
          configured: configured,
          description: repository.description,
          htmlUrl: repository.html_url,
        });
      }
      res.send(repositories);
    } catch (e) {
      console.log(e);
      res.status(503).end();
    }
  });

  app.get('/v1/repositories/:owner/:repo/pulls', async function (req, res) {
    if (!req.session.userId) {
      return res.status(401).end();
    }
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(401).end();
    }
    res.send(await getPullRequests(user, req.params.owner, req.params.repo));
  });

  app.put('/v1/repositories/:owner/:repo', async function (req, res) {
    if (!req.session.userId) {
      return res.status(401).end();
    }
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(401).end();
    }
    console.log(req.body);
    const repository = await Repository.findByOwnerAndRepo(
      req.params.owner,
      req.params.repo
    );

    const webhookUrl = `https://www.worlddriven.org/github`;
    const checked = req.body.checked;

    try {
      if (checked) {
        // Enable repository - create if doesn't exist
        if (!repository) {
          await Repository.create({
            owner: req.params.owner,
            repo: req.params.repo,
            userId: user._id,
          });
        }
        console.log(
          `Creating webhook for ${req.params.owner}/${req.params.repo}`
        );
        await createWebhook(
          user,
          req.params.owner,
          req.params.repo,
          webhookUrl
        );
      } else {
        // Disable repository - delete from database
        if (repository) {
          await Repository.delete(repository._id);
        }
        console.log(
          `Deleting webhook for ${req.params.owner}/${req.params.repo}`
        );
        await deleteWebhook(
          user,
          req.params.owner,
          req.params.repo,
          webhookUrl
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Repository configuration error:', error);
      res.status(500).json({ error: 'Failed to configure repository' });
    }
  });

  app.get(
    '/v1/repositories/:owner/:repo/pulls/:number',
    async function (req, res) {
      if (!req.session.userId) {
        return res.status(401).end();
      }

      const user = await User.findById(req.session.userId);
      if (!user) {
        return res.status(401).end();
      }
      const pullRequestData = await getPullRequestData(
        user,
        req.params.owner,
        req.params.repo,
        req.params.number
      );
      res.send(pullRequestData);
    }
  );

  // Public API route for pull request data (matches frontend expectation)
  app.get('/v1/:owner/:repo/pull/:number', async function (req, res) {
    const requestStart = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);

    console.log(
      `[REQ-${requestId}] 🌐 GET /v1/${req.params.owner}/${req.params.repo}/pull/${req.params.number} from ${req.ip}`
    );
    console.log(
      `[REQ-${requestId}] Session: ${req.session.userId ? 'authenticated' : 'anonymous'}, User-Agent: ${req.headers['user-agent']?.substring(0, 50)}...`
    );

    try {
      // Create authentication context with request information
      const auth = new Auth({
        sessionId: req.session.userId,
        owner: req.params.owner,
        repo: req.params.repo,
        strictUserAuth: false, // Allow fallbacks for better reliability
      });

      // Log the authentication strategy that will be used
      const authStrategy = await auth.getAuthStrategy();
      console.log(
        `[REQ-${requestId}] 🔐 Auth strategy: ${authStrategy.split('\n')[0]}`
      ); // First line only

      // Check if any authentication methods are available
      if (!(await auth.hasValidAuth())) {
        console.warn(
          `[REQ-${requestId}] ❌ No authentication available for ${req.params.owner}/${req.params.repo}`
        );
        return res.status(404).json({
          error:
            'Repository not configured for worlddriven or no authentication available',
        });
      }

      // Create GitHub client with automatic authentication fallback
      const githubClient = new GitHubClient(auth);

      // Get pull request data using clean business logic
      const pullRequestData = await getPullRequestData(
        githubClient,
        req.params.owner,
        req.params.repo,
        req.params.number
      );

      const duration = Date.now() - requestStart;
      console.log(
        `[REQ-${requestId}] ✅ SUCCESS: Returned pull request data in ${duration}ms`
      );

      res.json(pullRequestData);
    } catch (error) {
      const duration = Date.now() - requestStart;
      console.error(
        `[REQ-${requestId}] ❌ FAILED after ${duration}ms:`,
        error.message
      );

      // Log authentication strategy for debugging failures
      try {
        const auth = new Auth({
          sessionId: req.session.userId,
          owner: req.params.owner,
          repo: req.params.repo,
        });
        const strategy = await auth.getAuthStrategy();
        console.error(`[REQ-${requestId}] 🔍 Auth strategy was:`, strategy);
      } catch (authError) {
        console.error(
          `[REQ-${requestId}] Could not determine auth strategy:`,
          authError.message
        );
      }

      res.status(500).json({ error: 'Failed to fetch pull request data' });
    }
  });

  // GitHub webhook endpoint
  app.post('/github', async function (req, res) {
    const eventType = req.headers['x-github-event'];
    const data = req.body;

    console.log(`GitHub webhook received: ${eventType}`);

    try {
      let result;

      switch (eventType) {
        case 'installation':
          result = await handleInstallationWebhook(data);
          break;

        case 'installation_repositories':
          result = await handleInstallationRepositoriesWebhook(data);
          break;

        case 'pull_request':
          result = await handlePullRequestWebhook(data);
          break;

        case 'pull_request_review':
          result = await handlePullRequestReviewWebhook(data);
          break;

        case 'push':
          result = await handlePushWebhook(data);
          break;

        default:
          console.log(`Unhandled webhook event: ${eventType}`);
          result = { info: `Event ${eventType} not handled` };
      }

      res.json(result);
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Handle HTML serving - different for production vs development
  if (isProduction) {
    // Production: serve built files
    // Catch-all route for SPA (Express 5.x requires named wildcards)
    app.get('/*splat', (req, res) => {
      // TODO why is this dashboard.html - while on development it's index.html?
      res.sendFile('dashboard.html', { root: './dist/static' });
    });
  } else {
    // Development: use Vite to transform index.html
    app.get('/*splat', async (req, res) => {
      try {
        // Special handling for specific HTML pages
        let templatePath = 'index.html';

        if (req.path === '/dashboard') {
          templatePath = 'index.html'; // Use main template for all React pages
        }

        const template = await vite.transformIndexHtml(
          req.originalUrl,
          fs.readFileSync(templatePath, 'utf-8')
        );
        res.setHeader('Content-Type', 'text/html');
        res.send(template);
      } catch (error) {
        vite.ssrFixStacktrace(error);
        console.error(error);
        res.status(500).send('Internal Server Error');
      }
    });
  }

  const server = app.listen(process.env.PORT || 3000, function () {
    const { address, port } = server.address();
    console.log('App listening at http://%s:%s', address, port);
  });

  process.on('uncaughtException', (error, source) => {
    console.log(error, source);
  });

  // Only schedule cron jobs in real production
  if (process.env.NODE_ENV === 'production') {
    cron.schedule('51 * * * *', processPullRequests);
    setTimeout(processPullRequests, 1000 * 30); // Run after 30 seconds on startup
  }

  return { server: server, vite: vite };
}

// TODO don't like or understand this properly
if (import.meta.url === `file://${process.argv[1]}`) {
  await startServer();
}

export { startServer };
