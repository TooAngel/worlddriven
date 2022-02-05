import express from 'express';
import got from 'got';
import session from 'express-session';
import sessionSequelize from 'express-session-sequelize';
import Umzug from 'umzug';

import {getPullRequestData} from './helpers/pullRequest.js';
import {sequelize, Sequelize, models} from '../models/index.js';
import cron from 'node-cron';
import {createIssueComment, getPullRequests, mergePullRequest} from './helpers/github.js';

const SessionStore = sessionSequelize(session.Store);

const umzug = new Umzug({
  migrations: {
    path: './migrations',
    pattern: /(.*)\.cjs/,
    params: [
      sequelize.getQueryInterface(),
      Sequelize,
    ],
  },
  storage: 'sequelize',
  storageOptions: {
    sequelize: sequelize,
  },
});

(async () => {
  await umzug.up();
})();

const sequelizeSessionStore = new SessionStore({
  db: sequelize,
});

const app = express();

const sess = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sequelizeSessionStore,
  cookie: {},
  name: 'session',
};

if (app.get('env') === 'production') {
  app.set('trust proxy', 1); // trust first proxy
  sess.cookie.secure = true; // serve secure cookies
}

app.use(express.json());
app.use(session(sess));

app.use(express.static('./static'));

app.get('/', function(req, res) {
  res.sendFile('./static/index.html', {root: '.'});
});

app.get('/dashboard', function(req, res) {
  res.sendFile('./static/dashboard.html', {root: '.'});
});

// Properly define favicon to not need this route
app.get('/favicon.ico', function(req, res) {
  res.sendFile('./static/images/favicon.png', {root: '.'});
});

app.get('/imprint', function(req, res) {
  res.sendFile('./static/imprint.html', {root: '.'});
});

app.get('/privacyPolicy', function(req, res) {
  res.sendFile('./static/privacyPolicy.html', {root: '.'});
});

app.get('/js/main.js', function(req, res) {
  res.sendFile('./dist/main.js', {root: '.'});
});

app.get('/login', function(req, res) {
  if (req.session.userId) {
    res.redirect('/dashboard');
  } else {
    // TODO use `code`, too (https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps)
    res.redirect(`https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=public_repo,read:org,admin:repo_hook`);
  }
});

app.get('/github-callback', async function(req, res) {
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

  let user = await models.User.findOne({where: {githubAccessToken: response.body.access_token}});
  if (!user) {
    user = models.User.build({
      githubAccessToken: response.body.access_token,
    });
    await user.save();
  }
  req.session.userId = user.id;
  res.redirect('/dashboard');
});

app.get('/v1/user', async function(req, res) {
  if (!req.session.userId) {
    return res.status(401).end();
  }
  const user = await models.User.findOne({where: {id: req.session.userId}});
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

app.get('/v1/repositories', async function(req, res) {
  if (!req.session.userId) {
    return res.status(401).end();
  }
  const user = await models.User.findOne({where: {id: req.session.userId}});
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
      const dbRepository = await models.Repository.findOne({where: {owner: owner, repo: repo}});
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

app.get('/v1/repositories/:owner/:repo/pulls', async function(req, res) {
  if (!req.session.userId) {
    return res.status(401).end();
  }
  const user = await models.User.findOne({where: {id: req.session.userId}});
  if (!user) {
    return res.status(401).end();
  }
  res.send(await getPullRequests(user, req.params.owner, req.params.repo));
});

app.put('/v1/repositories/:owner/:repo', async function(req, res) {
  if (!req.session.userId) {
    return res.status(401).end();
  }
  const user = await models.User.findOne({where: {id: req.session.userId}});
  if (!user) {
    return res.status(401).end();
  }
  console.log(req.body);
  const repository = await models.Repository.findOne({where: {owner: req.params.owner, repo: req.params.repo}});
  if (repository) {
    repository.configured = req.body.checked;
    repository.save();
    return;
  }

  await models.Repository.create({
    owner: req.params.owner,
    repo: req.params.repo,
    configured: req.body.checked,
    userId: user.id,
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


app.get('/v1/repositories/:owner/:repo/pulls/:number', async function(req, res) {
  if (!req.session.userId) {
    return res.status(401).end();
  }

  const user = await models.User.findOne({where: {id: req.session.userId}});
  if (!user) {
    return res.status(401).end();
  }
  const pullRequestData = await getPullRequestData(user, req.params.owner, req.params.repo, req.params.number);
  res.send(pullRequestData);
});

// @static.route('/test/dashboard')
// def testdashboard():
//     return static.send_static_file('dashboard.html')


// @static.route('/<org_name>/<project_name>/pull/<int:pull_request_number>', strict_slashes=False)
// def show_pull_request(org_name, project_name, pull_request_number):
//     return static.send_static_file('pull_request.html')


// @static.route('/test/<org_name>/<project_name>/pull/<int:pull_request_number>', strict_slashes=False)
// def testshow_pull_request(org_name, project_name, pull_request_number):
//     return static.send_static_file('dashboard.html')


const server = app.listen(process.env.PORT || 3000, function() {
  const host = server.address().address;
  const port = server.address().port;

  console.log('App listening at http://%s:%s', host, port);
});

process.on('uncaughtException', (error, source) => {
  console.log(error, source);
});

cron.schedule('51 * * * *', async () => {
  console.log('-----------------------------------------------------------------');
  const repositories = await models.Repository.findAll({
    where: {configured: true},
    include: [
      {
        model: models.User,
        required: false,
        attributes: ['githubAccessToken'],
      },
    ],
  });
  for (const repository of repositories) {
    const pullRequests = await getPullRequests(repository.User.dataValues, repository.owner, repository.repo);
    for (const pullRequest of pullRequests) {
      const pullRequestData = await getPullRequestData(repository.User.dataValues, repository.owner, repository.repo, pullRequest.number);
      if (pullRequestData.times.daysToMerge < 0) {
        console.log(`Would merge ${repository.owner}/${repository.repo} - ${pullRequestData.title}`);
        const mergeResponse = await mergePullRequest(repository.User.dataValues, repository.owner, repository.repo, pullRequest.number);
        if (mergeResponse) {
          const comment = 'This pull request was merged by [worlddriven](https://www.worlddriven.org).';
          const issueResponse = await createIssueComment(repository.User.dataValues, repository.owner, repository.repo, pullRequest.number, comment);
          console.log(issueResponse);
          console.log('Merged');
        } else {
          console.log('Can not merge');
        }
      }
    }
  }
});
