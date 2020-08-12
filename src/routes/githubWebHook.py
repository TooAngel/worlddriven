import flask_restful
from flask import request
import logging
import github
from PullRequest import PullRequest as PR

mongo = None

DOMAIN = 'https://www.worlddriven.org'

def _set_status(repository, pull_request, state, message):
    commit = pull_request.get_commits()[0]
    url = '{}/{}/pull/{}'.format(DOMAIN, repository.full_name, pull_request.number)
    commit.create_status(state, url, message, 'worlddriven')

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
        mongo_repository = mongo.db.repositories.find_one({
            'full_name': self.data['repository']['full_name']
        })
        token = mongo_repository['github_access_token']
        github_client = github.Github(token)
        repository = github_client.get_repo(self.data['repository']['id'])
        pull_request = repository.get_pull(self.data['pull_request']['number'])

        pr = PR(repository, pull_request, token)
        pr.get_contributors()
        pr.update_contributors_with_reviews()
        pr.update_votes()
        pr.get_latest_dates()
        pr.get_merge_time()

        status_message = '{}/{} {} Merge in {} days {}'.format(
            pr.votes,
            pr.votes_total,
            round(pr.coefficient, 3) * 100,
            pr.days_to_merge.days,
            pr.days_to_merge.seconds / 3600
        )
        _set_status(repository, pull_request, 'success', status_message)

        # Refactor `_set_status` to accept the url (or get the url from PR)
        url = '{}/{}/pull/{}'.format(DOMAIN, repository.full_name, pull_request.number)
        pull_request.create_issue_comment('''This pull request will be automatically merged by [worlddriven](https://www.worlddriven.org) in {} days an {} hours.
Check the `worlddriven` status checks or the [dashboard]({}) for actual stats.

`Approved` reviews will speed this up.
`Request Changes` reviews will slow it down or stop it.'''.format(pr.days_to_merge.days, pr.days_to_merge.hours, url))

    def execute_synchronize(self):
        logging.info('execute_synchronize {}'.format(self.data))

    def execute_edited(self):
        logging.info('execute_edited {}'.format(self.data))

    def execute_closed(self):
        logging.info('execute_closed {}'.format(self.data))


class GithubWebHook(flask_restful.Resource):
    def handle_push(self, data):
        # print('push - ignored')
        # print(data)
        pass

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
            mongo_repository = mongo.db.repositories.find_one(
                {'full_name': data['repository']['full_name']}
            )
            token = mongo_repository['github_access_token']
            github_client = github.Github(token)
            repository = github_client.get_repo(data['repository']['id'])
            pull_request = repository.get_pull(data['pull_request']['number'])

            pr = PR(repository, pull_request)
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
            if review['state'] == 'APPROVED':
                value = 1
            elif review['state'] == 'CHANGES_REQUESTED':
                value = -1

            pr.contributors[reviewer]['review_value'] = value

            pr.update_votes()
            pr.get_latest_dates()
            pr.get_merge_time()

            status_message = '{}/{} {} Merge in {} days {}'.format(
                pr.votes,
                pr.votes_total,
                round(pr.coefficient, 3) * 100,
                pr.days_to_merge.days,
                pr.days_to_merge.seconds / 3600
            )
            _set_status(repository, pull_request, 'success', status_message)
            pull_request.create_issue_comment('''Thank you for the review.
            This pull request will be automatically merged by [worlddriven](https://www.worlddriven.org) in {} days, votes {}/{}.
            '''.format(pr.days_to_merge.days, pr.votes, pr.votes_total))
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
