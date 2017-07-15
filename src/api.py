from flask.ext import restful  # @UnresolvedImport
from PullRequest import mergeable_pull_request, get_coefficient_and_votes, get_contributors, get_reviews
import github
from flask import g, abort

class APIPullRequest(restful.Resource):
    def get(self, org, repo, pull):
        if not g.user:
            abort(401)
            return
        print(g.user)
        github_client = github.Github(g.user['github_access_token'])
        repository = github_client.get_repo('{}/{}'.format(org, repo))
        pull_request = repository.get_pull(pull)
        mergeable = mergeable_pull_request(pull_request)
        data_math = get_coefficient_and_votes(repository, pull_request)

        return {
            'pull_request': {
                'number': pull_request.number,
                'title': pull_request.title,
                'url': pull_request.url,
                'user': {
                    'login': pull_request.user.login
                    }
            },
            'mergeable': mergeable,
            'coefficient': data_math['coefficient'],
            'votes': data_math['votes'],
            'votes_total': data_math['votes_total'],
            'contributors': get_contributors(repository),
            'reviews': get_reviews(repository, pull_request)
        }
