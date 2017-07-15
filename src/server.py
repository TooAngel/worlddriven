import os
from flask import Flask, request
from flask.ext import restful  # @UnresolvedImport
import github
from apscheduler.schedulers.background import BackgroundScheduler
import requests
from datetime import datetime, timedelta
import sys
from random import randrange
import logging

logging.basicConfig(stream=sys.stdout, level=logging.INFO)

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
    pull_request.create_issue_comment(message)


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

        message = '''[democratic collaboration](https://github.com/TooAngel/democratic-collaboration)
Approved reviews will speed up the merge, request changes will slow it down.

Please review the PR to help.

'''

        # if len(reviewers) > 0:
        #     message += 'Summoning some reviewers:\n'
        #     for reviewer in reviewers:
        #         message += ' - @{}: {}\n'.format(reviewer['name'], getReviewerMotivation())

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
        # print(self.data)
        print('edited')
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
                print(self.data.keys())
                return

            if data['review']['state'] == 'commented':
                print('Review comment')
                return
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
        print('post not handled')
        print(data.keys())

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
    print(pull_request.title.encode('utf-8'))
    contributors = {contributor.author.login: contributor.total for contributor in (get_contributors(repository.id) or []) if contributor.author}
    if not mergeable_pull_request(pull_request):
        issue = repository.get_issue(pull_request.number)
        labels = [item for item in issue.labels if item.name == 'WIP']
        if not labels:
            print('Set WIP label')
            issue.add_to_labels('WIP')
            issue.create_comment('Adding WIP label, the title is prefixed with [WIP]')
        return

    issue = repository.get_issue(pull_request.number)
    labels = [item for item in issue.labels if item.name == 'WIP']
    if labels:
        print('Remove label')
        issue.remove_from_labels(labels[0])
        # TODO should summon reviewers here or on PR create if the PR is not WIP from the start
        issue.create_comment('''Removing WIP label, the title is not prefixed with [WIP]''')

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

    issue_events = [event for event in issue.get_events() if event.event == 'unlabeled' and event.raw_data['label']['name'] == 'WIP']
    issue_events = sorted(issue_events, key=lambda event: event.created_at, reverse=True)
    last_unlabel_date = issue_events[0].created_at if len(issue_events) > 0 else datetime(1960, 1, 1)

    events = [event for event in pull_request.head.repo.get_events() if event.type == 'PushEvent' and event.payload['ref'] == 'refs/heads/{}'.format(pull_request.head.ref)]
    events = sorted(events, key=lambda event: event.created_at, reverse=True)
    last_push_date = events[0].created_at if len(events) > 0 else datetime(1960, 1, 1)
    last_commit_date = commit.commit.author.date
    # print('pull request created', pull_request.created_at)
    # print('commit date:', last_commit_date)
    # print('unlabel date:', last_unlabel_date)
    # print('push date', last_push_date)
    max_date = max(last_commit_date, last_unlabel_date, last_push_date, pull_request.created_at)
    # print('max date', max_date)
    age = datetime.now() - max_date

    # Formular:
    # 5 days base value
    # commits in pull request times 5 days
    # days_to_merge = (1 - coefficient) * calculated days
    merge_duration = timedelta(days=(1 - coefficient) * (5 + pull_request.commits * 5))
    days_to_merge = merge_duration - age
    message = '''A new review, yeah.

    Votes: {}/{}
    Coefficient: {}
    Merging in {} days {} hours
    Age {} days {} hours'''.format(votes, votes_total, coefficient, days_to_merge.days, days_to_merge.seconds / 3600, age.days, age.seconds / 3600)
    print(message)
    if commentOnIssue:
        issue.create_comment(message)

    if age >= days_to_merge:
        print('Would merge now')
        try:
            pull_request.merge()
        except Exception as e:
            # Maybe add a comment that the conflicts should be resolved
            print(e)


def check_pull_requests():
    logging.info('Check pull requests: {}'.format(datetime.now()))
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

    sched.add_job(check_pull_requests, 'cron', hour='*', minute='*/5')

    app.debug = os.getenv('DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=int(os.getenv("PORT", 5001)))
