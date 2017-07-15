# democratic-collaboration

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/3d6f6434e85d4d00a07ff6918edebb5f)](https://www.codacy.com/app/TooAngel/democratic-collaboration?utm_source=github.com&utm_medium=referral&utm_content=TooAngel/democratic-collaboration&utm_campaign=badger)
[![CircleCI](https://circleci.com/gh/TooAngel/democratic-collaboration.svg?style=svg)](https://circleci.com/gh/TooAngel/democratic-collaboration)
[![gitter](https://badges.gitter.im/gitterHQ/gitter.png)](https://gitter.im/tooangel-democratic-collaboration/Lobby)
[![Code Climate](https://codeclimate.com/github/TooAngel/democratic-collaboration/badges/gpa.svg)](https://codeclimate.com/github/TooAngel/democratic-collaboration)

In open source projects there is one or more people responsible to merge
features and fixes in to the master branch. Due lack of time or interest this
can be a bottleneck.

Democratic collaboration introduces a contribution based weighted voting system
for merging. As soon as you contribute to a project, you get a share or
responsibility for the progress of the project.

Github Pull Request are the main contact point. Reviewing a PR with an
'Approve' votes for `yes`, 'Request change' is `no`.

The number of commits on the repository is the weight for the vote.

PRs can be ignore by prefixing the title with `[WIP] `.

If a PR is ready for merge a voting is started (starting `value` 0):
 - If a reviewer 'Request changes' the `value` decreases by their contribution value.
 - If a reviewer 'Approve' the `value` increases by their contribution value.
 - Based on the `value` and `total` of votes is `coefficient` is calculated and
   the PR is merged in `coefficient * (5 + pull_request.commits * 5)) days`.

## Develop

Set `TOKEN` as environment variable and run `python src/server.py`.
For github oauth feature provide `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`,
callback url is `/github-callback`.
Set Session secret as `SESSION_SECRET` initial a random string.

## Api

 - `/v1/:org/:repo/pull/:number` e.g. `/v1/tooangel/democratic-collaboration/pull/43/`
   to get info about the pull request

   Response:
```
{
    "coefficient": 0.9753086419753086,
    "contributors": {
        "TooAngel": 76,
        "WhiteHalmos": 1,
        "cbek": 1,
        "codacy-badger": 1,
        "pst": 2
    },
    "mergeable": true,
    "pull_request": {
        "number": 43,
        "title": "Add Angular UI",
        "url": "https://api.github.com/repos/TooAngel/democratic-collaboration/pulls/43",
        "user": {
            "login": "pst"
        }
    },
    "reviews": {
        "TooAngel": {
            "date": "2017-07-15T14:51:10Z",
            "value": 1
        },
        "cbek": {
            "date": "2017-07-15T14:54:30Z",
            "value": 1
        }
    },
    "votes": 79,
    "votes_total": 81
}
```


## Production environment

Started on some random server in `screen`, with
`while true; do . .env; pip install -r requirements.txt; git pull; python src/server.py; donewhile true; do . .env; pip install -r requirements.txt; git pull; python src/server.py; done`

Get `GET /restart/` stops the server process and restarted by the command
line command. Super ugly I know, just quickly solved somehow.
