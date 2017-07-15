import os
from flask import Flask, request, redirect, url_for, session, g, Response
from flask.ext import restful  # @UnresolvedImport
import github
from apscheduler.schedulers.background import BackgroundScheduler
import requests
import sys
from random import randrange
from flask_pymongo import PyMongo
from flask.ext.github import GitHub
import logging
from api import APIPullRequest
from PullRequest import check_pull_request, check_pull_requests, get_contributors
from bson.objectid import ObjectId
from flask_cors import CORS
import json

logging.basicConfig(stream=sys.stdout, level=logging.INFO)

app = Flask(
    __name__,
    static_folder='../ui/dist'
)

api = restful.Api(app)

app.config['MONGO_URI'] = os.getenv('MONGO_URI', 'mongodb://localhost:27017')
CORS(
    app,
    origins=['http://localhost:5000', 'https://dc.tooangel.de'],
    supports_credentials=True)
mongo = PyMongo(app)

app.config['GITHUB_CLIENT_ID'] = os.getenv('GITHUB_CLIENT_ID')
app.config['GITHUB_CLIENT_SECRET'] = os.getenv('GITHUB_CLIENT_SECRET')
github_oauth = GitHub(app)

@app.before_request
def before_request():
    g.user = None
    if 'user_id' in session:
        user = mongo.db.users.find_one({'_id': ObjectId(session['user_id'])})
        g.user = user

@github_oauth.access_token_getter
def token_getter():
    user = g.user
    if user is not None:
        user = user['github_access_token']
        return user

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/vendor.bundle.js')
def send_vendor_js():
    return app.send_static_file('vendor.bundle.js')

@app.route('/main.bundle.js')
def send_main_js():
    return app.send_static_file('main.bundle.js')

@app.route('/inline.bundle.js')
def send_inline_js():
    return app.send_static_file('inline.bundle.js')

@app.route('/polyfills.bundle.js')
def send_polyfills_js():
    return app.send_static_file('polyfills.bundle.js')

@app.route('/styles.bundle.js')
def send_styles_js():
    return app.send_static_file('styles.bundle.js')

@app.route('/styles.css')
def send_styles_css():
    return app.send_static_file('styles.css')


@app.route('/login/')
def login():
    referer = request.headers.get('Referer', '/')
    session['referer'] = referer
    if session.get('user_id', None) is None:
        return github_oauth.authorize()
    else:
        return redirect(referer)

@app.route('/logout/')
def logout():
    session.pop('user_id', None)
    return redirect(url_for('index'))

@app.route('/github-callback/')
@github_oauth.authorized_handler
def authorized(oauth_token):
    redirect_url = session.get('referer', url_for('index'))
    if oauth_token is None:
        logging.info("Authorization failed.")
        return redirect(redirect_url)

    user = mongo.db.users.find_one({'github_access_token': oauth_token})
    if not user:
        insert = mongo.db.users.insert_one({'github_access_token': oauth_token})
        user = mongo.db.users.find_one({'_id': insert.inserted_id})

    session['user_id'] = str(user['_id'])
    session.pop('referer', None)
    return redirect(redirect_url)

@app.route('/v1/user/')
def user():
    return Response(json.dumps(github_oauth.get('user')), mimetype='application/json')

def getReviewerMotivation():
    motivations = [
        'A proper review is appreciated',
        'Some warm words would be nice',
        'Please look at the code',
        'I just want to get this merged ASAP',
        'Not sure why you are here',
        'I always like your reviews',
        'Who are you?',
        'Check out this awesome code change and tell them where they fucked up!'
    ]
    return motivations[randrange(len(motivations) - 1)]


def _add_comment(repo, pull_request, message):
    token = os.getenv('TOKEN')
    github_client = github.Github(token)
    repository = github_client.get_repo(repo)
    pull_request = repository.get_pull(pull_request)
    pull_request.create_issue_comment(message)


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
        print(self.data['pull_request']['title'])

        contributors = {contributor.author.login: contributor.total for contributor in get_contributors(self.data['repository']['id'])}
        author = self.data['pull_request']['user']['login']
        possible_reviewers = [{'name': contributor, 'total': contributors[contributor]}
                              for contributor in contributors
                              if contributor != author and contributors[contributor] >= 10]
        possible_reviewers = sorted(possible_reviewers, key=lambda reviewer: -1 * reviewer['total'])

        reviewers = []
        for i in range(2):
            if len(possible_reviewers) == 0:
                break
            reviewers.append(possible_reviewers.pop(0))
        if len(possible_reviewers) > 0:
            reviewers.append(possible_reviewers[randrange(len(possible_reviewers) - 1)])

        message = '''[democratic collaboration](https://github.com/TooAngel/democratic-collaboration)
Approved reviews will speed up the merge, request changes will slow it down.

Please review the PR to help.

'''

        # if len(reviewers) > 0:
        #     message += 'Summoning some reviewers:\n'
        #     for reviewer in reviewers:
        #         message += ' - @{}: {}\n'.format(reviewer['name'], getReviewerMotivation())

        _add_comment(self.data['repository']['id'], self.data['pull_request']['number'], message)

    def execute_synchronize(self):
        token = os.getenv('TOKEN')
        github_client = github.Github(token)
        repository = github_client.get_repo(self.data['repository']['id'])
        issue = repository.get_issue(self.data['pull_request']['number'])
        labels = [item for item in issue.labels if item.name == 'WIP']
        if labels:
            message = 'Code update recognized, countdown starts fresh.'
            _add_comment(self.data['repository']['id'], self.data['pull_request']['number'], message)

    def execute_edited(self):
        # TODO check PR and add message that this is under voting
        # print(self.data)
        print('edited')
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
            if 'state' not in data['review']:
                print('No state')
                print(self.data.keys())
                return

            if data['review']['state'] == 'commented':
                print('Review comment')
                return
            token = os.getenv('TOKEN')
            github_client = github.Github(token)
            repository = github_client.get_repo(data['repository']['id'])
            pull_request = repository.get_pull(data['pull_request']['number'])
            check_pull_request(repository, pull_request, True)

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
        print('post not handled')
        print(data.keys())

class Restart(restful.Resource):
    def get(self):
        func = request.environ.get('werkzeug.server.shutdown')
        if func is None:
            raise RuntimeError('Not running with the Werkzeug Server')
        func()

api.add_resource(Restart, '/restart/')
api.add_resource(Github, '/github/')

api.add_resource(APIPullRequest, '/v1/<string:org>/<string:repo>/pull/<int:pull>/')


if __name__ == '__main__':
    sched = BackgroundScheduler()
    sched.start()

    sched.add_job(check_pull_requests, 'cron', hour='*', minute='*/5')

    app.secret_key = os.getenv('SESSION_SECRET')

    app.debug = os.getenv('DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=int(os.getenv("PORT", 5001)))
