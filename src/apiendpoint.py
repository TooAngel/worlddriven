import flask_restful  # @UnresolvedImport
import github
from flask import g, abort, request
import logging
from PullRequest import PullRequest
from datetime import datetime, timedelta
import os

from models import Repository, db

DOMAIN = 'https://www.worlddriven.org'


class APIPullRequest(flask_restful.Resource):
    def get(self, org, repo, pull):
        full_name = '{}/{}'.format(org, repo)
        db_repository = Repository.query.filter_by(full_name=full_name).first()
        token = os.getenv('GITHUB_USER_TOKEN')

        if db_repository:
            token = db_repository.github_access_token
        github_client = github.Github(token)
        repository = github_client.get_repo(full_name)
        pull_request = repository.get_pull(pull)

        pr = PullRequest(repository, pull_request, token)
        pr.get_contributors()
        pr.update_contributors_with_reviews()
        pr.update_votes()
        pr.get_latest_dates()
        pr.get_merge_time()

        for contributor in pr.contributors:
            pr.contributors[contributor]['time_value'] = timedelta(days=(pr.contributors[contributor]['commits'] / float(pr.votes_total)) * pr.total_merge_time).total_seconds()

        contributors = [pr.contributors[contributor] for contributor in pr.contributors]

        def activeFirst(value):
            return abs(value['review_value'] + 0.1) * value['commits']
        contributors = sorted(contributors, key=activeFirst, reverse=True)

        return {
            'pull_request': {
                'org': org,
                'repo': repo,
                'number': pull_request.number,
                'title': pull_request.title,
                'url': pull_request.url,
                'user': pull_request.user.raw_data,
                'state': pull_request.state,
                'mergeable': pull_request.mergeable,
                'stats': {
                    'mergeable': pr.mergeable_pull_request(),
                    'coefficient': pr.coefficient,
                    'votes': pr.votes,
                    'votes_total': pr.votes_total,
                    'contributors': contributors,
                    'commits': pr.commits,
                    'age': {
                        'days': pr.age.days,
                        'seconds': pr.age.seconds,
                        'microseconds': pr.age.microseconds,
                        'total_seconds': pr.age.total_seconds(),
                    }
                    # 'reviews': get_reviews(repository, pull_request)
                },
                'dates': {
                    'max': datetime.timestamp(pr.max_date),
                    'commit': datetime.timestamp(pr.commit_date),
                    'unlabel': datetime.timestamp(pr.unlabel_date),
                    'push': datetime.timestamp(pr.push_date),
                    'created': datetime.timestamp(pr.pull_request.created_at),
                    'last_draft': datetime.timestamp(pr.ready_for_review_date),
                },
                'times': {
                    'total_merge_time': pr.total_merge_time,
                    'merge_duration': {
                        'days': pr.merge_duration.days,
                        'seconds': pr.merge_duration.seconds,
                        'microseconds': pr.merge_duration.microseconds,
                        'total_seconds': pr.merge_duration.total_seconds(),
                    },
                    'days_to_merge': {
                        'days': pr.days_to_merge.days,
                        'seconds': pr.days_to_merge.seconds,
                        'microseconds': pr.days_to_merge.microseconds,
                        'total_seconds': pr.days_to_merge.total_seconds(),
                    },
                    'commits': pr.commits,
                    'merge_date': datetime.timestamp(pr.max_date + pr.merge_duration)
                }
            },
        }


class APIRepository(flask_restful.Resource):
    def get(self, org, repo):
        github_client = github.Github(g.user.github_access_token)
        repository = github_client.get_repo('{}/{}'.format(org, repo))
        return repository.raw_data

    def put(self, org, repo):
        checked = request.json['checked']
        full_name = '{}/{}'.format(org, repo)
        github_client = github.Github(g.user.github_access_token)
        repository = github_client.get_repo('{}/{}'.format(org, repo))
        config = {
            'url': '{}/github/'.format(DOMAIN),
            'insecure_ssl': '0',
            'content_type': 'json'
        }
        events = [u'commit_comment', u'pull_request', u'pull_request_review', u'push']
        db_repository = Repository.query.filter_by(full_name=full_name).first()
        if checked:
            try:
                repository.create_hook('web', config, events=events, active=True)
            except github.GithubException as e:
                logging.error(e)

            if not db_repository:
                db_repository = Repository(full_name=full_name, github_access_token=g.user.github_access_token)
                db.session.add(db_repository)
                db.session.commit()
        else:
            for hook in repository.get_hooks():
                if 'url' not in hook.config:
                    continue

                if hook.config['url'] == '{}/github/'.format(DOMAIN):
                    hook.delete()

            if db_repository:
                db.session.delete(db_repository)
                db.session.commit()
        return {}
