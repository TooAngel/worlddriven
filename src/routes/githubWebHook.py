import flask_restful
from flask import request
import logging
import github
from PullRequest import PullRequest as PR
import os

from models import Repository, db

DOMAIN = 'https://www.worlddriven.org'


class PullRequest(object):
    def __init__(self, data):
        self.data = data

    def execute(self):
        if self.data['action'] == 'opened':
            return self.execute_opened()
        if self.data['action'] == 'synchronize':
            return self.execute_synchronize()
        if self.data['action'] == 'edited':
            return self.execute_edited()
        if self.data['action'] == 'closed':
            return self.execute_closed()

    def execute_opened(self):
        db_repository = Repository.query.filter_by(full_name=self.data['repository']['full_name']).first()
        # Make sure it is configured
        if not db_repository:
            return

        token = os.getenv('GITHUB_USER_TOKEN')
        github_client = github.Github(token)
        repository = github_client.get_repo(self.data['repository']['id'])
        pull_request = repository.get_pull(self.data['pull_request']['number'])

        pr = PR(repository, pull_request, token)
        pr.get_contributors()
        pr.update_contributors_with_reviews()
        pr.update_votes()
        pr.get_latest_dates()
        pr.get_merge_time()

        pr.set_status()

        pull_request.create_issue_comment('''This pull request will be automatically merged by [worlddriven](https://www.worlddriven.org) in {} day(s) and {} hour(s).
The start date is based on the latest Commit date / Pull Request created date / (force) Push date.
The time to merge is 5 days plus 5 days for each commit.
Check the `worlddriven` status check or the [dashboard]({}) for actual stats.

To speed up or delay the merge review the pull request:
1. ![Files changed](https://www.worlddriven.org/static/images/github-files-changed.png)
1. ![Review changes](https://www.worlddriven.org/static/images/github-review-changes.png)

- Speed up: ![Approve](https://www.worlddriven.org/static/images/github-approve.png)
- Delay or stop: ![Request changes](https://www.worlddriven.org/static/images/github-request-changes.png)
'''.format(pr.days_to_merge.days, pr.days_to_merge.seconds // 3600, pr.url))

    def execute_synchronize(self):
        db_repository = Repository.query.filter_by(full_name=self.data['repository']['full_name']).first()
        # Make sure it is configured
        if not db_repository:
            return

        token = os.getenv('GITHUB_USER_TOKEN')
        github_client = github.Github(token)
        repository = github_client.get_repo(self.data['repository']['id'])
        pull_request = repository.get_pull(self.data['pull_request']['number'])

        pr = PR(repository, pull_request, token)
        pr.get_contributors()
        pr.update_contributors_with_reviews()
        pr.update_votes()
        pr.get_latest_dates()
        pr.get_merge_time()

        pr.set_status()

        pull_request.create_issue_comment('''The branch of this pull request was updated so the auto-merge time has been reset.

It will be automatically merged by [worlddriven](https://www.worlddriven.org) in {} day(s) and {} hour(s).
Check the `worlddriven` status check or the [dashboard]({}) for actual stats.
'''.format(pr.days_to_merge.days, pr.days_to_merge.seconds // 3600, pr.url))

    def execute_edited(self):
        logging.info('execute_edited {}'.format(self.data))

    def execute_closed(self):
        # Don't know if we need to do something here
        # logging.info('execute_closed {}'.format(self.data))
        pass


class GithubWebHook(flask_restful.Resource):
    def handle_push(self, data):
        # print('push - ignored')
        # print(data)
        return {'info': 'All fine, thanks'}

    def handle_pull_request(self, data):
        pull_request = PullRequest(data)
        pull_request.execute()
        return {'info': 'All fine, thanks'}

    def handle_pull_request_review(self, data):
        # print(data)
        if data['action'] == 'submitted':
            if 'state' not in data['review']:
                # print('No state')
                # print(data['review'].keys())
                return {'error': 'No state'}, 503

            if data['review']['state'] == 'commented':
                # print('Review comment')
                return {'info': 'Only commented'}

            logging.info('Need repository name: {}'.format(data))
            db_repository = Repository.query.filter_by(full_name=data['repository']['full_name']).first()
            # Make sure it is configured
            if not db_repository:
                return

            token = os.getenv('GITHUB_USER_TOKEN')
            github_client = github.Github(token)
            repository = github_client.get_repo(data['repository']['id'])
            pull_request = repository.get_pull(data['pull_request']['number'])

            pr = PR(repository, pull_request, token)
            pr.get_contributors()
            pr.update_contributors_with_reviews()

            review = data['review']
            reviewer = review['user']['login']
            if reviewer not in pr.contributors:
                pr.contributors[reviewer] = {
                    'name': reviewer,
                    'review_date': review['submitted_at']
                }

            value = 0
            if review['state'] == 'approved':
                value = 1
            elif review['state'] == 'changes_requested':
                value = -1

            logging.info('Approved pullrequest {} {}'.format(reviewer, value))
            pr.contributors[reviewer]['review_value'] = value

            pr.update_votes()
            pr.get_latest_dates()
            pr.get_merge_time()

            logging.info('Contributors {}'.format(pr.contributors))

            pr.set_status()

            pull_request.create_issue_comment('''Thank you for the review.
This pull request will be automatically merged by [worlddriven](https://www.worlddriven.org) in {} day(s) and {} hour(s). Current votes: {}/{}.

Check the `worlddriven` status checks or the [dashboard]({}) for actual stats.
            '''.format(pr.days_to_merge.days, pr.days_to_merge.seconds // 3600, pr.votes, pr.votes_total, pr.url))
            return {'info': 'All fine, thanks'}

    def post(self):
        data = request.json
        header = request.headers['X-GitHub-Event']
        if header == 'push':
            return self.handle_push(data)
        if header == 'pull_request':
            return self.handle_pull_request(data)
        if header == 'pull_request_review':
            return self.handle_pull_request_review(data)
