import logging
from datetime import datetime, timedelta
import os
import github
import requests
from GithubReviews import fetch_reviews
from pymongo import MongoClient
import sys

DOMAIN = 'https://www.worlddriven.org'

def toDateTime(value):
    return datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ')

def _set_status(pull_request, repository, state, message):
    commit = pull_request.get_commits().reversed[0]
    url = '{}/{}/pull/{}'.format(DOMAIN, repository.full_name, pull_request.number)
    statuses = commit.get_statuses()
    for status in statuses:
        if status.context == 'democratic collaboration' and status.description == message:
            return
    logging.info('Set Status message: {}'.format(message))
    commit.create_status(state, url, message, 'democratic collaboration')

def _get_last_date(data):
    data_sorted = sorted(data, key=lambda event: event.created_at, reverse=True)
    return data_sorted[0].created_at if len(data_sorted) > 0 else datetime(1960, 1, 1)

class PullRequest(object):
    def __init__(self, repository, pull_request):
        self.repository = repository
        self.pull_request = pull_request

    def get_contributors(self):
        contributors = self.repository.get_stats_contributors()
        self.contributors = {contributor.author.login: {'review_value': 0, 'name': contributor.author.login, 'commits': contributor.total} for contributor in (contributors or []) if contributor.author}
        if self.pull_request.user.login not in self.contributors:
            self.contributors[self.pull_request.user.login] = {'review_value': 0, 'name': self.pull_request.user.login, 'commits': 0}

    def update_contributors_with_reviews(self):
        data = fetch_reviews(self.repository.full_name, self.pull_request.number)

        reviews_decided = [review for review in data if review['state'] != 'COMMENTED']
        for review in reviews_decided:
            value = 0
            if review['state'] == 'APPROVED':
                value = 1
            elif review['state'] == 'CHANGES_REQUESTED':
                value = -1

            user = review['user']['login']

            if user not in self.contributors:
                self.contributors[user] = {'name': review['user']['login'], 'review_value': value, 'review_date': review['submitted_at']}
                continue
            if 'review_date' not in self.contributors[user] or toDateTime(self.contributors[user]['review_date']) < toDateTime(review['submitted_at']):
                self.contributors[user]['review_value'] = value
                self.contributors[user]['review_date'] = review['submitted_at']
                continue

        self.contributors[self.pull_request.user.login]['review_value'] = 1

    def update_votes(self):
        # Sum of total number of commits, initialize votes with the authors weight
        self.votes_total = sum(self.contributors[contributor].get('commits', 0) for contributor in self.contributors)
        self.votes = sum(self.contributors[contributor].get('review_value', 0) * self.contributors[contributor].get('commits', 0) for contributor in self.contributors)

        self.coefficient = 0
        if self.votes_total != 0:
            self.coefficient = float(self.votes) / float(self.votes_total)


    def get_latest_dates(self):
        issue = self.repository.get_issue(self.pull_request.number)
        issue_events = [event for event in issue.get_events() if event.event == 'unlabeled' and event.raw_data['label']['name'] == 'WIP']
        self.unlabel_date = _get_last_date(issue_events)

        events = [event for event in self.pull_request.head.repo.get_events() if event.type == 'PushEvent' and event.payload['ref'] == 'refs/heads/{}'.format(self.pull_request.head.ref)]
        self.push_date = _get_last_date(events)

        commits = self.pull_request.get_commits().reversed
        commit = max(commits, key=lambda commit: commit.commit.author.date)
        self.commit_date = commit.commit.author.date
        self.pull_request_date = self.pull_request.created_at

        self.max_date = max(self.commit_date, self.unlabel_date, self.push_date, self.pull_request.created_at)
        self.age = datetime.utcnow() - self.max_date

    def get_merge_time(self):
        self.total_merge_time = (5 + self.pull_request.commits * 5)
        self.merge_duration = timedelta(days=(1 - self.coefficient) * self.total_merge_time)
        self.days_to_merge = self.merge_duration - self.age
        self.commits = self.pull_request.commits

    def mergeable_pull_request(self):
        return not self.pull_request.title.startswith('[WIP]')

    def isWIP(self):
        if not self.mergeable_pull_request():
            issue = self.repository.get_issue(self.pull_request.number)
            labels = [item for item in issue.labels if item.name == 'WIP']
            if not labels:
                logging.info('Set WIP label')
                issue.add_to_labels('WIP')
                _set_status(self.pull_request, self.repository, 'error', 'The title is prefixed with [WIP]')
            return True

        issue = self.repository.get_issue(self.pull_request.number)
        labels = [item for item in issue.labels if item.name == 'WIP']
        if labels:
            logging.info('Remove label')
            issue.remove_from_labels(labels[0])
        return False

    def check_for_merge(self):
        if self.coefficient >= 0:
            status_message = '{} Merge at {}'.format(round(self.coefficient, 2), self.max_date + self.merge_duration)
            _set_status(self.pull_request, self.repository, 'success', status_message)
        else:
            status_message = '{} Will not merge'.format(round(self.coefficient, 2))
            _set_status(self.pull_request, self.repository, 'error', status_message)
            return

        if self.max_date + self.merge_duration < datetime.utcnow() :
            logging.info('Would merge now')
            try:
                self.pull_request.merge()
            except Exception as e:
                # Maybe add a comment that the conflicts should be resolved
                logging.error(e)



    def execute(self):
        self.get_contributors()
        self.update_contributors_with_reviews()
        self.update_votes()
        self.get_latest_dates()
        self.get_merge_time()
        if self.isWIP():
            return
        self.check_for_merge()


def check_pull_request(repository, pull_request, commentOnIssue):
    logging.info('-' * 20)
    logging.info(pull_request.title.encode('utf-8'))

    pr = PullRequest(repository, pull_request)
    pr.execute()


def check_pull_requests():
    logging.info('Check pull requests: {}'.format(datetime.utcnow()))
    token = os.getenv('TOKEN')
    github_client = github.Github(token)

    mongo_url = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/server')
    mongo = MongoClient(mongo_url)
    database = mongo.get_database()
    mongo_repositories = database.repositories.find()
    repositories = [mongo_repository['full_name'] for mongo_repository in mongo_repositories]

    for repository_name in repositories:
        repository = github_client.get_repo(repository_name)
        for pull_request in repository.get_pulls():
            check_pull_request(repository, pull_request, False)

if __name__ == '__main__':
    logging.basicConfig(stream=sys.stdout, level=logging.INFO)
    check_pull_requests()
