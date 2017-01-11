import os
from flask import Flask, request
from flask.ext import restful  # @UnresolvedImport


app = Flask(
    __name__,
    template_folder='../templates',
    static_folder='../static'
)
api = restful.Api(app)


class PullRequest(Object):
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

    def execute_opened(self):
        // TODO check PR and add message that this is under voting
        print(self.data)
        print(self.data.keys)

    def execute_synchronize(self):
        // TODO check PR and add message that this is under voting
        print(self.data)
        print(self.data.keys())

    def execute_edited(self):
        // TODO check PR and add message that this is under voting
        print(self.data)
        print(self.data.keys())
        print(self.data['changes'])

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
        if header == 'push':
            self.handle_push(data)
            return true
        if header == 'pull_request':
            self.handle_pull_request(data)
            return true
        print(header)
        print(data)

api.add_resource(Github, '/github/')


if __name__ == '__main__':
    app.debug = os.getenv('DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=int(os.getenv("PORT", 5001)))
