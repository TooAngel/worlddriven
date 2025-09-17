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
import {
  handlePullRequestWebhook,
  handlePullRequestReviewWebhook,
  handlePushWebhook,
} from './helpers/webhookHandler.js';
import {
  handleInstallationWebhook,
  handleInstallationRepositoriesWebhook,
} from './helpers/installationHandler.js';

const mongoSessionStore = MongoStore.create({
  clientPromise: client.connect(),
  dbName: 'worlddriven',
  touchAfter: 24 * 3600, // lazy session update
});

const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
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

      let user = await User.findByGithubToken(data.access_token);
      if (!user) {
        user = await User.create({
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
        let configured = false;
        const dbRepository = await Repository.findByOwnerAndRepo(owner, repo);
        if (dbRepository) {
          configured = dbRepository.configured;
        }
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
      if (repository) {
        // Update existing repository configuration
        await Repository.update(repository._id, { configured: checked });
      } else {
        // Create new repository configuration
        await Repository.create({
          owner: req.params.owner,
          repo: req.params.repo,
          configured: checked,
          userId: user._id,
        });
      }

      // Create or delete webhook based on configuration
      if (checked) {
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
    try {
      // Find repository configuration to determine authentication method
      const repository = await Repository.findByOwnerAndRepo(
        req.params.owner,
        req.params.repo
      );

      if (!repository || !repository.configured) {
        return res
          .status(404)
          .json({ error: 'Repository not configured for worlddriven' });
      }

      let pullRequestData;

      if (repository.installationId) {
        // Use GitHub App authentication
        pullRequestData = await getPullRequestData(
          repository.installationId,
          req.params.owner,
          req.params.repo,
          req.params.number
        );
      } else if (repository.userId) {
        // Use PAT authentication
        const user = await User.findById(repository.userId);
        if (!user) {
          return res.status(500).json({ error: 'Repository user not found' });
        }
        pullRequestData = await getPullRequestData(
          user,
          req.params.owner,
          req.params.repo,
          req.params.number
        );
      } else {
        return res.status(500).json({
          error: 'No authentication method configured for repository',
        });
      }

      res.json(pullRequestData);
    } catch (error) {
      console.error('Public PR API error:', error);
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
    app.get('/*', (_req, res) => {
      // TODO why is this dashboard.html - while on development it's index.html?
      res.sendFile('dashboard.html', { root: './dist/static' });
    });
  } else {
    // Development: use Vite to transform index.html
    app.get('*', async (req, res) => {
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

  cron.schedule('51 * * * *', processPullRequests);
  setTimeout(processPullRequests, 1000 * 30); // Run after 30 seconds on startup
}

startServer();
