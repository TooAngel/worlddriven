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
import { acceptRepositoryInvitations } from './helpers/invitationProcessor.js';
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
import { sessionAuthMiddleware } from './middleware/sessionAuth.js';

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

  // Session authentication middleware (supports both cookies and Authorization header)
  app.use(sessionAuthMiddleware);

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
    // Store redirect URL for webapp integration (redirect back after OAuth)
    if (req.query.redirect) {
      req.session.authRedirect = req.query.redirect;
    }

    if (req.session.userId) {
      // Already logged in - redirect to stored URL or dashboard
      const redirectUrl = req.session.authRedirect || '/dashboard';
      delete req.session.authRedirect;
      res.redirect(redirectUrl);
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

      // Redirect to stored URL (webapp) or default to dashboard
      const redirectUrl = req.session.authRedirect || '/dashboard';
      delete req.session.authRedirect;
      res.redirect(redirectUrl);
    } catch (e) {
      console.error('GitHub OAuth error:', e);
      // On error, redirect to stored error URL or home
      const errorRedirect = req.session.authRedirect
        ? `${req.session.authRedirect}?error=oauth_failed`
        : '/';
      delete req.session.authRedirect;
      res.redirect(errorRedirect);
    }
  });

  // ============================================================================
  // API Authentication Endpoints
  // ============================================================================
  // Webapp Integration Pattern (API-based):
  // 1. Webapp calls GET /api/auth/url?redirect_uri=<callback> to get OAuth URL
  // 2. Webapp redirects user to GitHub OAuth URL
  // 3. GitHub redirects to webapp callback with ?code=
  // 4. Webapp calls POST /api/auth/callback with {code, redirect_uri}
  // 5. Core exchanges code for token, creates session, returns {sessionId}
  // 6. Webapp sets sessionId as httpOnly cookie
  // 7. Subsequent requests: proxy converts cookie to SESSION header
  // ============================================================================

  app.get('/api/auth/status', async function (req, res) {
    if (!req.session.userId) {
      return res.status(401).json({ authenticated: false });
    }

    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(401).json({ authenticated: false });
    }

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `token ${user.githubAccessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const userData = await response.json();
      res.json({
        authenticated: true,
        user: {
          name: userData.name,
          login: userData.login,
          avatarUrl: userData.avatar_url,
        },
      });
    } catch (e) {
      console.error('Failed to fetch user data:', e);
      res.status(503).json({ error: 'Failed to fetch user data' });
    }
  });

  // @deprecated - Use GET /api/user/logout instead (webapp uses this)
  app.post('/api/auth/logout', function (req, res) {
    req.session.destroy(err => {
      if (err) {
        console.error('Session destruction error:', err);
        return res.status(500).json({ error: 'Failed to logout' });
      }
      res.json({ success: true });
    });
  });

  // Logout endpoints for webapp compatibility
  // Webapp proxy intercepts /user/logout to clear httpOnly cookie
  const logoutHandler = function (req, res) {
    req.session.destroy(err => {
      if (err) {
        console.error('Session destruction error:', err);
        return res.status(500).json({ error: 'Failed to logout' });
      }
      res.json({ success: true });
    });
  };
  app.get('/user/logout', logoutHandler);
  app.get('/api/user/logout', logoutHandler);

  // Session endpoint for webapp - returns sessionId for httpOnly cookie setup
  // Used after OAuth callback redirects back to webapp
  app.get('/api/auth/session', function (req, res) {
    if (!req.session.userId) {
      return res.status(401).json({ authenticated: false });
    }
    // Return the session ID so webapp can set it as httpOnly cookie
    res.json({
      authenticated: true,
      sessionId: req.sessionID,
    });
  });

  // Returns GitHub OAuth URL for webapp to redirect to
  app.get('/api/auth/url', function (req, res) {
    const redirectUri = req.query.redirect_uri;
    if (!redirectUri) {
      return res.status(400).json({ error: 'redirect_uri is required' });
    }

    const oauthUrl =
      `https://github.com/login/oauth/authorize?` +
      `client_id=${process.env.GITHUB_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=public_repo,read:org,admin:repo_hook`;

    res.json({ url: oauthUrl });
  });

  // Exchanges OAuth code for session - webapp calls this after GitHub callback
  app.post('/api/auth/callback', express.json(), async function (req, res) {
    const { code, redirect_uri } = req.body;

    if (!code || !redirect_uri) {
      return res
        .status(400)
        .json({ error: 'code and redirect_uri are required' });
    }

    try {
      // Exchange code for access token
      const tokenResponse = await fetch(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code,
            redirect_uri,
          }),
        }
      );

      if (!tokenResponse.ok) {
        throw new Error(
          `GitHub token exchange failed: ${tokenResponse.status}`
        );
      }

      const tokenData = await tokenResponse.json();
      if (tokenData.error || !tokenData.access_token) {
        return res.status(401).json({
          error: tokenData.error_description || 'Failed to obtain access token',
        });
      }

      // Fetch GitHub user info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!userResponse.ok) {
        throw new Error(`Failed to fetch GitHub user: ${userResponse.status}`);
      }

      const githubUser = await userResponse.json();
      if (!githubUser.id) {
        return res.status(401).json({ error: 'Invalid GitHub user response' });
      }

      // Find or create user
      let user = await User.findByGithubUserId(githubUser.id);
      if (user) {
        user = await User.update(user._id, {
          githubAccessToken: tokenData.access_token,
        });
      } else {
        user = await User.create({
          githubUserId: githubUser.id,
          githubAccessToken: tokenData.access_token,
        });
      }

      // Create session
      req.session.userId = user._id.toString();

      // Return session ID for webapp to set as httpOnly cookie
      res.json({
        authenticated: true,
        sessionId: req.sessionID,
      });
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.status(500).json({ error: 'Authentication failed' });
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
  // Respond immediately to avoid GitHub's 10-second timeout and retries
  app.post('/github', function (req, res) {
    const eventType = req.headers['x-github-event'];
    const deliveryId = req.headers['x-github-delivery'];
    const data = req.body;

    console.log(
      `GitHub webhook received: ${eventType} (delivery: ${deliveryId})`
    );

    // Respond immediately to prevent GitHub timeout/retry
    res.json({ info: 'Webhook received, processing asynchronously' });

    // Process webhook asynchronously
    (async () => {
      try {
        switch (eventType) {
          case 'installation':
            await handleInstallationWebhook(data);
            break;

          case 'installation_repositories':
            await handleInstallationRepositoriesWebhook(data);
            break;

          case 'pull_request':
            await handlePullRequestWebhook(data);
            break;

          case 'pull_request_review':
            await handlePullRequestReviewWebhook(data);
            break;

          case 'push':
            await handlePushWebhook(data);
            break;

          default:
            console.log(`Unhandled webhook event: ${eventType}`);
        }

        console.log(
          `Webhook ${eventType} (${deliveryId}) processed successfully`
        );
      } catch (error) {
        console.error(
          `Webhook ${eventType} (${deliveryId}) processing error:`,
          error
        );
      }
    })();
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
    cron.schedule('0 * * * *', acceptRepositoryInvitations); // Every hour at :00
    cron.schedule('51 * * * *', processPullRequests);
    setTimeout(acceptRepositoryInvitations, 1000 * 30); // Run 30 seconds after startup
    setTimeout(processPullRequests, 1000 * 60); // Run 60 seconds after startup
  }

  return { server: server, vite: vite };
}

// TODO don't like or understand this properly
if (import.meta.url === `file://${process.argv[1]}`) {
  await startServer();
}

export { startServer };
