# democratic-collaboration

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/3d6f6434e85d4d00a07ff6918edebb5f)](https://www.codacy.com/app/TooAngel/democratic-collaboration?utm_source=github.com&utm_medium=referral&utm_content=TooAngel/democratic-collaboration&utm_campaign=badger)
[![CircleCI](https://circleci.com/gh/TooAngel/democratic-collaboration.svg?style=svg)](https://circleci.com/gh/TooAngel/democratic-collaboration)
[![gitter](https://badges.gitter.im/gitterHQ/gitter.png)](https://gitter.im/tooangel-democratic-collaboration/Lobby)
[![Code Climate](https://codeclimate.com/github/TooAngel/democratic-collaboration/badges/gpa.svg)](https://codeclimate.com/github/TooAngel/democratic-collaboration)

Hosted under https://dc.tooangel.de/

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

- `/v1/:org/:repo/` e.g. `/v1/tooangel/democratic-collaboration/`
  to get info about the repository

  Response:
```
{
    "archive_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/{archive_format}{/ref}",
    "assignees_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/assignees{/user}",
    "blobs_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/git/blobs{/sha}",
    "branches_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/branches{/branch}",
    "clone_url": "https://github.com/TooAngel/democratic-collaboration.git",
    "collaborators_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/collaborators{/collaborator}",
    "comments_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/comments{/number}",
    "commits_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/commits{/sha}",
    "compare_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/compare/{base}...{head}",
    "contents_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/contents/{+path}",
    "contributors_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/contributors",
    "created_at": "2017-01-11T08:59:45Z",
    "default_branch": "master",
    "deployments_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/deployments",
    "description": "Reviewer based weighted automatic pull request merging",
    "downloads_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/downloads",
    "events_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/events",
    "fork": false,
    "forks": 5,
    "forks_count": 5,
    "forks_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/forks",
    "full_name": "TooAngel/democratic-collaboration",
    "git_commits_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/git/commits{/sha}",
    "git_refs_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/git/refs{/sha}",
    "git_tags_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/git/tags{/sha}",
    "git_url": "git://github.com/TooAngel/democratic-collaboration.git",
    "has_downloads": true,
    "has_issues": true,
    "has_pages": true,
    "has_projects": true,
    "has_wiki": false,
    "homepage": "",
    "hooks_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/hooks",
    "html_url": "https://github.com/TooAngel/democratic-collaboration",
    "id": 78621052,
    "issue_comment_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/issues/comments{/number}",
    "issue_events_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/issues/events{/number}",
    "issues_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/issues{/number}",
    "keys_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/keys{/key_id}",
    "labels_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/labels{/name}",
    "language": "Python",
    "languages_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/languages",
    "merges_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/merges",
    "milestones_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/milestones{/number}",
    "mirror_url": null,
    "name": "democratic-collaboration",
    "network_count": 5,
    "notifications_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/notifications{?since,all,participating}",
    "open_issues": 5,
    "open_issues_count": 5,
    "owner": {
        "avatar_url": "https://avatars5.githubusercontent.com/u/131156?v=4",
        "events_url": "https://api.github.com/users/TooAngel/events{/privacy}",
        "followers_url": "https://api.github.com/users/TooAngel/followers",
        "following_url": "https://api.github.com/users/TooAngel/following{/other_user}",
        "gists_url": "https://api.github.com/users/TooAngel/gists{/gist_id}",
        "gravatar_id": "",
        "html_url": "https://github.com/TooAngel",
        "id": 131156,
        "login": "TooAngel",
        "organizations_url": "https://api.github.com/users/TooAngel/orgs",
        "received_events_url": "https://api.github.com/users/TooAngel/received_events",
        "repos_url": "https://api.github.com/users/TooAngel/repos",
        "site_admin": false,
        "starred_url": "https://api.github.com/users/TooAngel/starred{/owner}{/repo}",
        "subscriptions_url": "https://api.github.com/users/TooAngel/subscriptions",
        "type": "User",
        "url": "https://api.github.com/users/TooAngel"
    },
    "permissions": {
        "admin": true,
        "pull": true,
        "push": true
    },
    "private": false,
    "pulls_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/pulls{/number}",
    "pushed_at": "2017-07-15T20:13:36Z",
    "releases_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/releases{/id}",
    "size": 154,
    "ssh_url": "git@github.com:TooAngel/democratic-collaboration.git",
    "stargazers_count": 10,
    "stargazers_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/stargazers",
    "statuses_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/statuses/{sha}",
    "subscribers_count": 1,
    "subscribers_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/subscribers",
    "subscription_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/subscription",
    "svn_url": "https://github.com/TooAngel/democratic-collaboration",
    "tags_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/tags",
    "teams_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/teams",
    "trees_url": "https://api.github.com/repos/TooAngel/democratic-collaboration/git/trees{/sha}",
    "updated_at": "2017-07-15T13:15:53Z",
    "url": "https://api.github.com/repos/TooAngel/democratic-collaboration",
    "watchers": 10,
    "watchers_count": 10
}
```

 - `/v1/:org/:repo/pull/:number` e.g. `/v1/tooangel/democratic-collaboration/pull/43/`
   to get info about the pull request

   Response:
```
{
    "coefficient": 0.9764705882352941,
    "contributors": {
        "TooAngel": 80,
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
            "avatar_url": "https://avatars6.githubusercontent.com/u/253456?v=4",
            "bio": null,
            "blog": "https://coreos.com",
            "company": "@coreos",
            "created_at": "2010-04-26T20:24:24Z",
            "email": null,
            "events_url": "https://api.github.com/users/pst/events{/privacy}",
            "followers": 8,
            "followers_url": "https://api.github.com/users/pst/followers",
            "following": 0,
            "following_url": "https://api.github.com/users/pst/following{/other_user}",
            "gists_url": "https://api.github.com/users/pst/gists{/gist_id}",
            "gravatar_id": "",
            "hireable": null,
            "html_url": "https://github.com/pst",
            "id": 253456,
            "location": "Berlin, Germany",
            "login": "pst",
            "name": "Philipp Strube",
            "organizations_url": "https://api.github.com/users/pst/orgs",
            "public_gists": 2,
            "public_repos": 23,
            "received_events_url": "https://api.github.com/users/pst/received_events",
            "repos_url": "https://api.github.com/users/pst/repos",
            "site_admin": false,
            "starred_url": "https://api.github.com/users/pst/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/pst/subscriptions",
            "type": "User",
            "updated_at": "2017-07-14T16:47:15Z",
            "url": "https://api.github.com/users/pst"
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
    "votes": 83,
    "votes_total": 85
}
```


## Production environment

Started on some random server in `screen`, with
`while true; do bash run.sh; done`

Get `GET /restart/` stops the server process and restarted by the command
line command. Super ugly I know, just quickly solved somehow.
