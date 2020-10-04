# world driven

[![CircleCI](https://circleci.com/gh/TooAngel/worlddriven.svg?style=svg)](https://circleci.com/gh/TooAngel/worlddriven)
[![discord](/static/images/Discord-Logo-small.png)](https://discord.gg/RrGFHKb)
[![Code climate](https://api.codeclimate.com/v1/badges/ec4136b6d2eeff72f192/maintainability)](https://codeclimate.com/github/TooAngel/worlddriven/maintainability)

World driven introduces a contribution based weighted voting system
for time-based auto-merges. It defines a process and automates the process of
merging Pull Requests based on Reviews.

World driven automatically merges Pull Requests. To give interested people time
to review and approve or request changes (in world driven speech: vote), a Pull
Requests is merged after a certain amount of time.
To still be able to release changes quickly, the time to merge is reduced by
each positive vote. The time to reduce (merge boost) is based on previous
contributions of the reviewer (think of number of commits).
Voting against the Pull Request increases the time to merge and if a certain
threshold is reached, will block the merge.

The configuration for the repository is:

- Merge duration for a pull request: 5 days
- Each commits adds additional 5 days (more commits, more complexity,
more time to review)
- Pull Requests without reviews are merged. (This is not always desired)

Read more on https://www.worlddriven.org

## Setup

### Run with docker compose
Copy `.env-example` to `.env` and add your environment variables.
```sh
docker-compose up
```

### Manual

The application uses MongoDB as back end, the default configuration is `localhost:27017`
This can be overwritten with the environment variable: `MONGODB_URI`

As server Gunicorn is used, checkout the `Procfile` or use
`gunicorn --workers=1 --worker-class=flask_sockets.worker server:app --chdir src`.

The authentication and authentication uses GitHub OAuth and API.

For OAuth and merging of pull requests create an GitHub OAuth App
(https://developer.github.com/apps/building-oauth-apps/creating-an-oauth-app/)
an set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` as environment variable.
The GitHub callback path is: `/github-callback`.

For commenting a personal token is used
(https://docs.github.com/en/free-pro-team@latest/github/authenticating-to-github/creating-a-personal-access-token)
this needs to be set as: `GITHUB_USER_TOKEN`

Set Session secret as `SESSION_SECRET` initial a random string.

To disable https in a local environment set `DEBUG=true` as environment variable.

## Testing

Run JavaScript tests with: `npm run test`
Run python tests with: `pytest`

## Configuration

To allow different configurations on different repositories you can place a
`.worlddriven.ini` (see `.worlddriven.ini-example`) in the root of your
repository and adapt the values.
When World Driven checks new Pull Requests it fetches the `.worlddriven.ini` from
your default branch (fetching from the Pull Request could be a security issue)
and applies the configuration.

## Front end

The Front end has three views:

- `/` the front page
- `/dashboard` a dashboard with an overview of the repositories and a button to
enable World Driven for the repository
- `/:org/:repo/pull/:pull_number` A detailed calculation breakdown for the pull
request

To be able to easily work on the different views test endpoints are available:

- `/test/dashboard` - for the dashboard
- `/test/:org/:repo/pull/:pull_number` - for the pull request view

## Production environment

The World Driven auto-merge service is hosted on Heroku, tested via CircleCI,
merged via World Driven and automatically deployed.
