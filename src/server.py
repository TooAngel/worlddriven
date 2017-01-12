import os
from flask import Flask, request
from flask.ext import restful  # @UnresolvedImport
import github
from apscheduler.schedulers.background import BackgroundScheduler
import requests
from datetime import datetime

app = Flask(
    __name__,
    template_folder='../templates',
    static_folder='../static'
)
api = restful.Api(app)


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

    def _add_comment(self, repo, pull_request, message):
        token = os.getenv('TOKEN')
        github_client = github.Github(token)
        repository = github_client.get_repo(repo)
        pull_request = repository.get_pull(pull_request)
        pull_request.create_issue_comment('DCBOT: {}'.format(message))

    def execute_opened(self):
        # TODO check PR
        # print(self.data)
        # print(self.data.keys())
        message = 'This repository is under [democratic collaboration](https://github.com/TooAngel/democratic-collaboration) and will be merged automatically.'
        self._add_comment(self.data['repository']['id'], self.data['pull_request']['number'], message)

    def execute_synchronize(self):
        # TODO check PR
        # print(self.data)
        # print(self.data.keys())
        message = 'Code update recognized, countdown starts fresh.'
        self._add_comment(self.data['repository']['id'], self.data['pull_request']['number'], message)

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
                # TODO take as last point for countdown
                get_contributors()
                return
            print(data['state'])
            print(data['review'])
            print(self.data)
            print(self.data.keys())

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

api.add_resource(Github, '/github/')

def get_contributors(repository_name):
    token = os.getenv('TOKEN')
    github_client = github.Github(token)
    repository = github_client.get_repo(repository_name)
    return repository.get_stats_contributors()

def toDateTime(value):
    return datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ')

def get_reviews(owner, repo, number):
    if not owner:
        owner = 'tooangel'
    if not repo:
        repo = 'democratic-collaboration'
    url = 'https://api.github.com/repos/{}/{}/pulls/{}/reviews'.format(owner, repo, number)
    headers = {
    'Accept': 'application/vnd.github.black-cat-preview+json',
    'Authorization': 'token {}'.format(os.getenv('TOKEN'))
    }
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    data = response.json()
    if 'message' in data and data['message'] == 'Not Found':
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

def check_pull_requests():
    token = os.getenv('TOKEN')
    github_client = github.Github(token)
    repositories = ['tooangel/democratic-collaboration', 'tooangel/screeps']

    for repository_name in repositories:
        repository = github_client.get_repo(repository_name)
        contributors = {contributor.author.login: contributor.total for contributor in get_contributors(repository_name)}

        for pull_request in repository.get_pulls():
            if not mergeable_pull_request(pull_request):
                issue = repository.get_issue(pull_request.number)
                labels = [item for item in issue.labels if item.name == 'WIP']
                if not labels:
                    issue.add_to_labels('WIP')
                    issue.create_comment('DCBOT: Adding WIP label, the title is prefixed with [WIP]')
                continue

            issue = repository.get_issue(pull_request.number)
            labels = [item for item in issue.labels if item.name == 'WIP']
            if labels:
                issue.remove_from_labels(labels[0])
                issue.create_comment('DCBOT: Removing WIP label, the title is not prefixed with [WIP]')

            author = pull_request.user.login
            possible_reviewers = {contributor: contributors[contributor] for contributor in contributors if contributor != author}

            # Sum of total contriution without the author of the pull request
            votes_total = sum(possible_reviewers[possible_reviewer] for possible_reviewer in possible_reviewers)
            votes = 0

            reviews = get_reviews(False, False, pull_request.number)

            for review in reviews:
                if review not in possible_reviewers:
                    print('{} not in reviewers'.format(review))
                    continue

                if reviews[review]['state'] == 'APPROVED':
                    votes += possible_reviewers[review]
                    continue
                votes += possible_reviewers[review]

            print(pull_request.title)
            if votes == votes_total:
                print('Would merge now')
                # pull_request.merge()

            # TODO chech vote percentage vs time to last event

            print(votes, votes_total)


if __name__ == '__main__':
    sched = BackgroundScheduler()
    sched.start()

    sched.add_job(check_pull_requests, 'cron', second=0)

    app.debug = os.getenv('DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=int(os.getenv("PORT", 5001)))
