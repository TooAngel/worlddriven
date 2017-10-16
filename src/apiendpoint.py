import flask_restful  # @UnresolvedImport
import github
from flask import g, abort, request

mongo = None

class APIPullRequest(flask_restful.Resource):
    def get(self, org, repo, pull):
        if not g.user:
            abort(401)
            return
        print(g.user)
        github_client = github.Github(g.user['github_access_token'])
        repository = github_client.get_repo('{}/{}'.format(org, repo))
        pull_request = repository.get_pull(pull)
        # mergeable = mergeable_pull_request(pull_request)
        # data_math = get_coefficient_and_votes(repository, pull_request)

        return {
            'pull_request': {
                'number': pull_request.number,
                'title': pull_request.title,
                'url': pull_request.url,
                'user': pull_request.user.raw_data
            },
            'mergeable': mergeable,
            'coefficient': data_math['coefficient'],
            'votes': data_math['votes'],
            'votes_total': data_math['votes_total'],
            'contributors': get_contributors(repository),
            'reviews': get_reviews(repository, pull_request)
        }

class APIRepository(flask_restful.Resource):
    def get(self, org, repo):
        github_client = github.Github(g.user['github_access_token'])
        repository = github_client.get_repo('{}/{}'.format(org, repo))
        return repository.raw_data

    def put(self, org, repo):
        checked = request.form['checked'] == 'true'
        full_name = '{}/{}'.format(org, repo)
        github_client = github.Github(g.user['github_access_token'])
        repository = github_client.get_repo('{}/{}'.format(org, repo))
        config = {
            'url': 'https://dc.tooangel.de/github/',
            'insecure_ssl': '0',
            'content_type': 'json'
        }
        events = [u'commit_comment', u'pull_request', u'pull_request_review', u'push']
        print(checked)
        if checked:
            repository.create_hook('web', config, events=events, active=True)
            repo_db = mongo.db.repositories.find_one({'full_name': full_name})
            if not repo_db:
                insert = mongo.db.repositories.insert_one({'full_name': full_name, 'github_access_token': g.user['github_access_token']})
        else:
            for hook in repository.get_hooks():
                if hook.config['url'] == 'https://dc.tooangel.de/github/':
                    hook.delete()
            repo_db = mongo.db.repositories.delete_many({'full_name': full_name})
        return {}
