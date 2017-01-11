import os
from flask import Flask, request
from flask.ext import restful  # @UnresolvedImport
import github

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
            if data['review']['state'] == 'commented':
                # TODO take as last point for countdown
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


if __name__ == '__main__':
    app.debug = os.getenv('DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=int(os.getenv("PORT", 5001)))
