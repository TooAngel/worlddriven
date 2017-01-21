import os
from flask import Flask, request
from flask.ext import restful  # @UnresolvedImport
import github
from apscheduler.schedulers.background import BackgroundScheduler
import requests
from datetime import datetime, timedelta
import sys
from random import randrange


app = Flask(
    __name__,
    template_folder='../templates',
    static_folder='../static'
)
api = restful.Api(app)


def getReviewerMotivation():
    motivations = [
        'A proper review is appreciated',
        'Some warm words would be nice',
        'Please look at the code',
        'I just want to get this merged ASAP',
        'Not sure why you are here',
        'I always like your reviews',
        'Who are you?',
        'Check out this awesome code change and tell them where they fucked up!'
    ]
    return motivations[randrange(len(motivations) - 1)]


def _add_comment(repo, pull_request, message):
    token = os.getenv('TOKEN')
    github_client = github.Github(token)
    repository = github_client.get_repo(repo)
    pull_request = repository.get_pull(pull_request)
    pull_request.create_issue_comment('DCBOT: {}'.format(message))


class PullRequest(object):
    def __init__(self, data):
        self.data = data

    def execute(self):
        print(self.data['action'])
        if self.data['action'] == 'opened':
            return self.execute_opened()
        if self.data['action'] == 'synchronize':
            return self.execute_synchronize()
        if self.data['action'] == 'edited':
            return self.execute_edited()
        if self.data['action'] == 'closed':
            return self.execute_closed()

    def execute_opened(self):
        print(self.data['pull_request']['title'])

        contributors = {contributor.author.login: contributor.total for contributor in get_contributors(self.data['repository']['id'])}
        author = self.data['pull_request']['user']['login']
        possible_reviewers = [{'name': contributor, 'total': contributors[contributor]}
                              for contributor in contributors
                              if contributor != author and contributors[contributor] >= 10]
        possible_reviewers = sorted(possible_reviewers, key=lambda reviewer: -1 * reviewer['total'])

        reviewers = []
        for i in range(2):
            if len(possible_reviewers) == 0:
                break
            reviewers.append(possible_reviewers.pop(0))
        if len(possible_reviewers) > 0:
            reviewers.append(possible_reviewers[randrange(len(possible_reviewers) - 1)])

        message = '''
This repository is under [democratic collaboration](https://github.com/TooAngel/democratic-collaboration) and will be merged automatically.

The merge decision is based on the outcome of the reviews:
 - `Approve` add the reviewer value (number of commits) to the `metric`
 - `Request changes` substract the reviewer value from the `metric`

 The merge will happen after `(1 - metric/total.votes) * (5 + pull_request.commits * 5))` calculated from the last code change.

Please review the PR to make a good democratic decision.

'''

        if len(reviewers) > 0:
            message += 'Summoning some reviewers:\n'
            for reviewer in reviewers:
                message += ' - @{}: {}\n'.format(reviewer['name'], getReviewerMotivation())

        _add_comment(self.data['repository']['id'], self.data['pull_request']['number'], message)

    def execute_synchronize(self):
        repository = github_client.get_repo(self.data['repository']['id'])
        issue = repository.get_issue(self.data['pull_request']['number'])
        labels = [item for item in issue.labels if item.name == 'WIP']
        if labels:
            message = 'Code update recognized, countdown starts fresh.'
            _add_comment(self.data['repository']['id'], self.data['pull_request']['number'], message)

    def execute_edited(self):
        # TODO check PR and add message that this is under voting
        print(self.data)
        print(self.data.keys())
        print(self.data['changes'])

    def execute_closed(self):
        # TODO Anything to do here?
        # print(self.data)
        # print(self.data.keys())
        pass

class Github(restful.Resource):
    def handle_push(self, data):
        print('push - ignored')
        # print(data)

    def handle_pull_request(self, data):
        pull_request = PullRequest(data)
        pull_request.execute()

    def handle_pull_request_review(self, data):
        if data['action'] == 'submitted':
            if 'state' not in data['review']:
                print('No state')
                print(self.data)
                return

            if data['review']['state'] == 'commented':
                print('Review comment')
                return
            # TODO Fix issue, only proper reviews should trigger the check, comments not
            import json
            print(json.dumps(data))
            token = os.getenv('TOKEN')
            github_client = github.Github(token)
            repository = github_client.get_repo(data['repository']['id'])
            pull_request = repository.get_pull(data['pull_request']['number'])
            check_pull_request(repository, pull_request, True)

    def post(self):
        data = request.json
        header = request.headers['X-GitHub-Event']
        print(header)
        if header == 'push':
            return self.handle_push(data)
        if header == 'pull_request':
            return self.handle_pull_request(data)
        if header == 'pull_request_review':
            return self.handle_pull_request_review(data)
        print(data)

class Restart(restful.Resource):
    def get(self):
        func = request.environ.get('werkzeug.server.shutdown')
        if func is None:
            raise RuntimeError('Not running with the Werkzeug Server')
        func()

api.add_resource(Restart, '/restart/')
api.add_resource(Github, '/github/')

def get_contributors(repository_name):
    token = os.getenv('TOKEN')
    github_client = github.Github(token)
    repository = github_client.get_repo(repository_name)
    return repository.get_stats_contributors()

def toDateTime(value):
    return datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ')

def get_reviews(repo, number):
    url = 'https://api.github.com/repos/{}/pulls/{}/reviews'.format(repo.full_name, number)
    headers = {
    'Accept': 'application/vnd.github.black-cat-preview+json',
    'Authorization': 'token {}'.format(os.getenv('TOKEN'))
    }
    response = requests.get(url, headers=headers)
    if response.status_code == 404:
        print(url)
        print(response.content)
        print('Status Code 404')
        return {}
    response.raise_for_status()
    data = response.json()
    if 'message' in data and data['message'] == 'Not Found':
        print('message: Not Found')
        return {}
    reviews_decided = [review for review in data if review['state'] != 'COMMENTED']
    last_reviews = {}
    for review in reviews_decided:
        if review['user']['login'] not in last_reviews:
            last_reviews[review['user']['login']] = review
            continue
        if toDateTime(last_reviews[review['user']['login']]['submitted_at']) < toDateTime(review['submitted_at']):
            last_reviews[review['user']['login']] = review
            continue
    return last_reviews

def mergeable_pull_request(pull_request):
    # TODO check number of commits and messages for 'fixup!'
    return not pull_request.title.startswith('[WIP]')

def check_pull_request(repository, pull_request, commentOnIssue):
    print(pull_request.title)
    contributors = {contributor.author.login: contributor.total for contributor in (get_contributors(repository.id) or {})}
    if not mergeable_pull_request(pull_request):
        issue = repository.get_issue(pull_request.number)
        labels = [item for item in issue.labels if item.name == 'WIP']
        if not labels:
            issue.add_to_labels('WIP')
            issue.create_comment('DCBOT: Adding WIP label, the title is prefixed with [WIP]')
        return

    issue = repository.get_issue(pull_request.number)
    labels = [item for item in issue.labels if item.name == 'WIP']
    if labels:
        issue.remove_from_labels(labels[0])
        # TODO should summon reviewers here or on PR create if the PR is not WIP from the start
        issue.create_comment('''DCBOT: Removing WIP label, the title is not prefixed with [WIP]''')

    author = pull_request.user.login
    possible_reviewers = {contributor: contributors[contributor] for contributor in contributors if contributor != author}

    # Sum of total number of commits, initialize votes with the authors weight
    votes_total = sum(contributors[contributor] for contributor in contributors)
    votes = 0
    if author in contributors:
        votes = contributors[author]

    reviews = get_reviews(repository, pull_request.number)
    for review in reviews:
        if review not in possible_reviewers:
            print('{} not in reviewers'.format(review))
            continue
        if reviews[review]['state'] == 'APPROVED':
            votes += possible_reviewers[review]
            continue
        if reviews[review]['state'] == 'CHANGES_REQUESTED':
            votes -= possible_reviewers[review]
            continue
        print(reviews[review]['state'])

    coefficient = 0
    if votes_total != 0:
        coefficient = float(votes) / float(votes_total)

    if coefficient < 0:
        print('Negative coefficient')
        return

    commits = pull_request.get_commits()
    commit = max(commits, key=lambda commit: commit.commit.author.date)
    age = datetime.now() - commit.commit.author.date

    pull_request.commits

    # Formular:
    # 5 days base value
    # commits in pull request times 5 days
    # days_to_merge = (1 - coefficient) * calculated days
    days_to_merge = timedelta(days=(1 - coefficient) * (5 + pull_request.commits * 5))
    message = '''DCBOT: A new review, yeah.

    Votes: {}/{}
    Coefficient: {}
    Merging in {} days {} hours
    Age {} days {} hours'''.format(votes, votes_total, coefficient, (days_to_merge.days - age.days), (days_to_merge.seconds - age.seconds) / 3600, age.days, age.seconds / 3600)
    if commentOnIssue:
        print(message)
        issue.create_comment(message)

    print(age, days_to_merge)
    if age >= days_to_merge:
        print('Would merge now')
        pull_request.merge()


def check_pull_requests():
    print(datetime.now())
    token = os.getenv('TOKEN')
    github_client = github.Github(token)
    repositories = ['tooangel/democratic-collaboration', 'tooangel/screeps']

    for repository_name in repositories:
        repository = github_client.get_repo(repository_name)

        for pull_request in repository.get_pulls():
            check_pull_request(repository, pull_request, False)


if __name__ == '__main__':
    sched = BackgroundScheduler()
    sched.start()

    sched.add_job(check_pull_requests, 'cron', hour='*')

    app.debug = os.getenv('DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=int(os.getenv("PORT", 5001)))
