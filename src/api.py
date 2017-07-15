from flask.ext import restful  # @UnresolvedImport
from PullRequest import mergeable_pull_request, get_coefficient_and_votes
import github
from flask import g

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
            'mergeable': mergeable,
            'coefficient': data_math['coefficient'],
            'votes': data_math['votes'],
            'votes_total': data_math['votes_total']
        }
