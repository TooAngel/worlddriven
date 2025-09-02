import express from 'express';
import got from 'got';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import { createServer } from 'vite';
import fs from 'fs';

import { client } from './database/database.js';
import { User, Repository } from './database/models.js';
import cron from 'node-cron';
import { processPullRequests } from './helpers/pullRequestProcessor.js';
import { getPullRequests } from './helpers/github.js';
import { getPullRequestData } from './helpers/pullRequest.js';

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
    app.set('trust proxy', 1); // trust first proxy
    sess.cookie.secure = true; // serve secure cookies
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

  app.get('/login', function (req, res) {
    if (req.session.userId) {
      res.redirect('/dashboard');
    } else {
      // TODO use `code`, too (https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps)
      res.redirect(
        `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=public_repo,read:org,admin:repo_hook`
      );
    }
  });

  app.get('/github-callback', async function (req, res) {
    const url = 'https://github.com/login/oauth/access_token';
    const options = {
      json: {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: req.query.code,
      },
      responseType: 'json',
    };
    const response = await got.post(url, options);
    if (!response.body.access_token) {
      return res.redirect('/');
    }

    let user = await User.findByGithubToken(response.body.access_token);
    if (!user) {
      user = await User.create({
        githubAccessToken: response.body.access_token,
      });
    }
    req.session.userId = user._id.toString();
    res.redirect('/dashboard');
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
    const options = {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${user.githubAccessToken}`,
      },
      responseType: 'json',
    };
    try {
      const response = await got.get(url, options);
      const data = {
        name: response.body.name,
      };
      res.send(data);
    } catch (e) {
      console.log(e);
      console.log(e.response.body);
      console.log(options);
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
    const options = {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${user.githubAccessToken}`,
      },
      responseType: 'json',
    };
    try {
      // TODO handle pagination
      const response = await got.get(url, options);
      const repositories = [];
      for (const repository of response.body) {
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
      console.log(e.response.body);
      console.log(options);
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
    if (repository) {
      await Repository.update(repository._id, { configured: req.body.checked });
      return;
    }

    await Repository.create({
      owner: req.params.owner,
      repo: req.params.repo,
      configured: req.body.checked,
      userId: user._id,
    });

    // TODO create or delete webhook
    // checked = request.json['checked']
    // full_name = '{}/{}'.format(org, repo)
    // github_client = github.Github(g.user.github_access_token)
    // repository = github_client.get_repo('{}/{}'.format(org, repo))
    // config = {
    //     'url': '{}/github/'.format(DOMAIN),
    //     'insecure_ssl': '0',
    //     'content_type': 'json'
    // }
    // events = [u'commit_comment', u'pull_request', u'pull_request_review', u'push']
    // db_repository = Repository.query.filter_by(full_name=full_name).first()
    // if checked:
    //     try:
    //         repository.create_hook('web', config, events=events, active=True)
    //     except github.GithubException as e:
    //         logging.error(e)

    //     if not db_repository:
    //         db_repository = Repository(full_name=full_name, github_access_token=g.user.github_access_token)
    //         db.session.add(db_repository)
    //         db.session.commit()
    // else:
    //     for hook in repository.get_hooks():
    //         if 'url' not in hook.config:
    //             continue

    //         if hook.config['url'] == '{}/github/'.format(DOMAIN):
    //             hook.delete()

    //     if db_repository:
    //         db.session.delete(db_repository)
    //         db.session.commit()
    // return {}

    res.end();
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

  // Handle HTML serving - different for production vs development
  if (isProduction) {
    // Production: serve built files
    app.get('/*', (_req, res) => {
      res.sendFile('index.html', { root: './dist' });
    });
  } else {
    // Development: use Vite to transform index.html
    app.get('/js/main.js', (_req, res) => {
      // Redirect to Vite dev server module
      res.redirect('/src/public/js/script.jsx');
    });

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
}

startServer();
