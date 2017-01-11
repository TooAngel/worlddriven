import os
from flask import Flask, request
from flask.ext import restful  # @UnresolvedImport


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

    def execute_opened(self):
        # TODO check PR and add message that this is under voting
        print(self.data)
        print(self.data.keys())
        token = os.getenv('TOKEN')
        github_client = github.Github(token)
        repository = github_client.get_repo(self.data['repository']['id'])
        pull_request = repository.get_pull(self.data['pull_request']['id'])
        pull_request.create_issue_comment('yeah')


    def execute_synchronize(self):
        # TODO check PR and add message that this is under voting
        print(self.data)
        print(self.data.keys())

    def execute_edited(self):
        # TODO check PR and add message that this is under voting
        print(self.data)
        print(self.data.keys())
        print(self.data['changes'])

    def execute_closed(self):
        # TODO check PR and add message that this is under voting
        print(self.data)
        print(self.data.keys())

class Github(restful.Resource):
    def handle_push(self, data):
        print('push - ignored')
        # print(data)

    def handle_pull_request(self, data):
        pull_request = PullRequest(data)
        pull_request.execute()

    def post(self):
        data = request.json
        header = request.headers['X-GitHub-Event']
        print(header)
        if header == 'push':
            self.handle_push(data)
            return
        if header == 'pull_request':
            self.handle_pull_request(data)
            return
        print(data)

api.add_resource(Github, '/github/')


if __name__ == '__main__':
    app.debug = os.getenv('DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=int(os.getenv("PORT", 5001)))
