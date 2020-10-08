# world driven

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/a3385a0433a649be95639b8a59fcb6fe)](https://www.codacy.com/app/TooAngel/worlddriven?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=TooAngel/worlddriven&amp;utm_campaign=Badge_Grade)
[![CircleCI](https://circleci.com/gh/TooAngel/worlddriven.svg?style=svg)](https://circleci.com/gh/TooAngel/worlddriven)
[![discord](https://discord.com/assets/94db9c3c1eba8a38a1fcf4f223294185.png)](https://discord.gg/RrGFHKb)
[![Code climate](https://api.codeclimate.com/v1/badges/ec4136b6d2eeff72f192/maintainability)](https://codeclimate.com/github/TooAngel/worlddriven/maintainability)

Hosted under https://www.worlddriven.org

World driven introduces a contribution based weighted voting system
for merging of pull requests. As soon as you contribute to a project, you get a share or
responsibility for the progress of the project.

Read more on https://www.worlddriven.org

## Develop

Run `gunicorn --workers=1 --worker-class=flask_sockets.worker server:app --chdir src`.

As backend a mongodb server is used and can be configured via: `MONGODB_URI`
environment variable.

For github oauth feature provide `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`,
callback url is `/github-callback`.
Set Session secret as `SESSION_SECRET` initial a random string.

Run tests with: `pytest`

### Install via docker compose

Copy `.env-example` to `.env` and add your environment variables.
```sh
docker-compose up
```

## Configuration

To allow different configurations on different repositories you can place a
`.worlddriven.ini` (see `.worlddriven.ini-example`) in the root of your
repository and adapt the values.
When worlddriven checks new Pull Requests it fetches the `.worlddriven.ini` from
your default branch (fetching from the Pull Request could be a security issue)
and applies the configuration.

## Production environment

The worlddriven auto merge service is hosted on heroku, tested via CircleCI,
merge via worlddriven and automatically deployed.
