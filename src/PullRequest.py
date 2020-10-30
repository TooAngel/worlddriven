import logging
import configparser
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


def _get_last_date(data):
    data_sorted = sorted(data, key=lambda event: event.created_at, reverse=True)
    return data_sorted[0].created_at if len(data_sorted) > 0 else datetime(1960, 1, 1)


class PullRequest(object):
    def __init__(self, repository, pull_request, token):
        self.repository = repository
        self.pull_request = pull_request
        self.token = token
        self.url = '{}/{}/pull/{}'.format(DOMAIN, self.repository.full_name, self.pull_request.number)
        self.config = {
            'baseMergeTimeInHours': 240.,
            'perCommitTimeInHours': 0.,
            'merge_method': 'squash',
        }

        try:
            config_file_content = repository.get_contents(".worlddriven.ini")
            config = configparser.ConfigParser()
            config.read_string(config_file_content.decoded_content.decode('utf-8'))
            config_new = {}
            config_new['baseMergeTimeInHours'] = float(config['DEFAULT'].get('baseMergeTimeInHours'))
            config_new['perCommitTimeInHours'] = float(config['DEFAULT'].get('perCommitTimeInHours'))
            config_new['merge_method'] = config['DEFAULT'].get('merge_method')
            self.config.update(config_new)
        except Exception as e:
            pass

    def set_status(self):
        if self.coefficient >= 0:
            status_message = '{} Merge at {}'.format(round(self.coefficient, 2), self.max_date + self.merge_duration)
            self._update_status('success', status_message)
        else:
            status_message = '{} Will not merge'.format(round(self.coefficient, 2))
            self._update_status('error', status_message)
            return

    def _update_status(self, state, message):
        commit = self.pull_request.get_commits().reversed[0]
        statuses = commit.get_statuses()
        for status in statuses:
            if status.context == 'World driven' and status.description == message:
                return
        try:
            commit.create_status(state, self.url, message, 'World driven')
        except Exception as e:
            logging.exception('PullRequest._set_status exception {}'.format(commit))

    def get_contributors(self):
        contributors = self.repository.get_stats_contributors()
        self.contributors = {contributor.author.login: {'review_value': 0, 'name': contributor.author.login, 'commits': contributor.total} for contributor in (contributors or []) if contributor.author}
        if self.pull_request.user.login not in self.contributors:
            self.contributors[self.pull_request.user.login] = {'review_value': 0, 'name': self.pull_request.user.login, 'commits': 0}

    def update_contributors_with_reviews(self):
        data = fetch_reviews(self.repository.full_name, self.pull_request.number, self.token)
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
        # TODO this is removing the label, instead draft PRs should be used - so need to check when the status changed to open
        ready_for_review_events = [event for event in issue.get_events() if event.event == 'ready_for_review']
        self.ready_for_review_date = _get_last_date(ready_for_review_events)
        self.unlabel_date = _get_last_date(issue_events)
        events = [event for event in self.pull_request.head.repo.get_events() if event.type == 'PushEvent' and event.payload['ref'] == 'refs/heads/{}'.format(self.pull_request.head.ref)]
        self.push_date = _get_last_date(events)

        commits = self.pull_request.get_commits().reversed
        commit = max(commits, key=lambda commit: commit.commit.author.date)
        # TODO is this correct? `author.date`
        self.commit_date = commit.commit.author.date
        self.pull_request_date = self.pull_request.created_at

        self.max_date = max(self.commit_date, self.unlabel_date, self.push_date, self.pull_request.created_at, self.ready_for_review_date)
        self.age = datetime.utcnow() - self.max_date

    def get_merge_time(self):
        self.total_merge_time = (self.config['baseMergeTimeInHours'] / 24 + self.pull_request.commits * self.config['perCommitTimeInHours'] / 24)
        self.merge_duration = timedelta(days=(1 - self.coefficient) * self.total_merge_time)
        self.days_to_merge = self.merge_duration - self.age
        self.commits = self.pull_request.commits

    def mergeable_pull_request(self):
        self.pull_request.mergeable

    def check_for_merge(self):
        self.set_status()

        if self.coefficient >= 0 and self.max_date + self.merge_duration < datetime.utcnow():
            logging.info('Would merge now')
            try:
                self.pull_request.merge(merge_method=self.config['merge_method'])
            except Exception as e:
                # Maybe add a comment that the conflicts should be resolved
                logging.exception(self.pull_request)
                logging.info(self.pull_request.state)
                return
            try:
                self.pull_request.create_issue_comment('This pull request was merged by [worlddriven](https://www.worlddriven.org).')
            except Exception as e:
                logging.exception(self.pull_request)
                return

    def execute(self):
        if not self.pull_request.head.repo:
            logging.info('Pull Request head repository deleted, delete Pull Request')
            self.pull_request.edit(state="closed")
            return

        self.get_contributors()
        self.update_contributors_with_reviews()
        self.update_votes()
        self.get_latest_dates()
        self.get_merge_time()

        self.check_for_merge()


def check_pull_request(repository, pull_request, commentOnIssue, token):
    logging.info('Pull Request: {}'.format(pull_request.title.encode('utf-8')))

    pr = PullRequest(repository, pull_request, token)
    pr.execute()
    return pr


def check_pull_requests():
    logging.info('Check pull requests: {}'.format(datetime.utcnow()))

    mongo_url = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/worlddriven')
    mongo = MongoClient(mongo_url)
    database = mongo.get_database()
    mongo_repositories = database.repositories.find()
    for mongo_repository in mongo_repositories:
        repository_name = mongo_repository['full_name']
        logging.info('Repository: {}'.format(repository_name))
        github_client = github.Github(mongo_repository['github_access_token'])
        repository = github_client.get_repo(repository_name)
        for pull_request in repository.get_pulls(state='open'):
            if not pull_request.mergeable:
                continue
            check_pull_request(repository, pull_request, False, mongo_repository['github_access_token'])


if __name__ == '__main__':
    logging.basicConfig(stream=sys.stdout, level=logging.INFO)
    check_pull_requests()
