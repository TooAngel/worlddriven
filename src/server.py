import os
from flask import Flask, request, redirect, url_for, session, g, Response, render_template, send_file
import flask_restful
from flask_compress import Compress
from flask_sslify import SSLify
import github
from apscheduler.schedulers.background import BackgroundScheduler
import requests
import sys
from random import randrange
from flask_pymongo import PyMongo
from flask_github import GitHub
import logging
import apiendpoint
from PullRequest import PullRequest as PR, check_pull_requests
from bson.objectid import ObjectId
import json
from datetime import timedelta
from flask_sockets import Sockets

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s %(message)s',
                    handlers=[logging.StreamHandler()])

app = Flask(
    __name__,
    static_folder='../static',
    template_folder='../templates'
)

if not os.getenv('DEBUG'):
    sslify = SSLify(app, permanent=True)

sockets = Sockets(app)
Compress(app)

api = flask_restful.Api(app)

app.config['MONGO_URI'] = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/worlddriven')
mongo = PyMongo(app)
apiendpoint.mongo = mongo

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

@app.route('/favicon.ico')
def favicon():
    return app.send_static_file('logo.ico')

@app.route('/robots.txt')
def robotstxt():
    return app.send_static_file('robots.txt')

@app.route('/static/js/main.js')
def main_js():
    return send_file('../dist/main.js')

@app.route('/static/css/style.css')
def style_css():
    return send_file('../static/style.css')


@app.route('/sitemap.xml')
def sitemapxml():
    return app.send_static_file('sitemap.xml')

@app.route('/')
def index():
    response = app.send_static_file('index.html')
    response.headers['server'] = None
    response.headers['X-XSS-Protection'] = '1; mode=block'
    return response

@app.route('/v1/repositories')
def repositories():
    github_client = github.Github(g.user['github_access_token'])
    user = github_client.get_user()
    github_repositories = user.get_repos(type='public')
    repositories = []

    existing_repositories = {}
    # Better fetch via the names, but how (efficiently)
    mongo_repositories = mongo.db.repositories.find({'github_access_token': g.user['github_access_token']})
    for mongo_repository in mongo_repositories:
        existing_repositories[mongo_repository['full_name']] = True

    for repository in github_repositories:
        repositories.append({
            'full_name': repository.full_name,
            'configured': existing_repositories.get(repository.full_name)
        })

    return Response(json.dumps(repositories),  mimetype='application/json')

@app.route('/dashboard')
def dashboard():
    return app.send_static_file('dashboard.html')

@app.route('/<org_name>/<project_name>/pull/<int:pull_request_number>')
def show_pull_request(org_name, project_name, pull_request_number):
    return app.send_static_file('pull_request.html')

@app.route('/login/')
def login():
    if session.get('user_id', None) is None:
        return github_oauth.authorize(scope='public_repo,admin:repo_hook')
    else:
        return redirect('/dashboard')

@app.route('/logout/')
def logout():
    session.pop('user_id', None)
    return redirect(url_for('index'))

@app.route('/github-callback/')
@github_oauth.authorized_handler
def authorized(oauth_token):
    if oauth_token is None:
        logging.info("Authorization failed.")
        return redirect(redirect_url)

    user = mongo.db.users.find_one({'github_access_token': oauth_token})
    if not user:
        insert = mongo.db.users.insert_one({'github_access_token': oauth_token})
        user = mongo.db.users.find_one({'_id': insert.inserted_id})

    session['user_id'] = str(user['_id'])
    return redirect('/dashboard')

@app.route('/v1/user/')
def user():
    return Response(json.dumps(github_oauth.get('user')), mimetype='application/json')

def _set_status(repository, pull_request, state, message):
    commit = pull_request.get_commits()[0]
    commit.create_status(state, '', message, 'worlddriven')

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
        mongo_repository = mongo.db.repositories.find_one({'full_name': self.data['repository']['full_name']})
        github_client = github.Github(mongo_repository['github_access_token'])
        repository = github_client.get_repo(self.data['repository']['full_name'])
        pull_request = repository.get_pull(self.data['pull_request']['number'])
        pr = PR(repository, pull_request, mongo_repository['github_access_token'])

        contributors = {contributor.author.login: contributor.total for contributor in pr.get_contributors()}
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

        message = '''[World driven](https://github.com/tooangel/worlddriven)
`Approved` reviews will speed up the merge, `request changes` will slow it down.

Please review the PR to help.

'''
        _set_status(repostiory, pull_request, 'pending', message)

    def execute_synchronize(self):
        mongo_repository = mongo.db.repositories.find_one({'full_name': self.data['repository']['full_name']})
        github_client = github.Github(mongo_repository['github_access_token'])
        repository = github_client.get_repo(self.data['repository']['id'])
        pull_request = repository.get_pull(self.data['pull_request']['number'])
        issue = repository.get_issue(self.data['pull_request']['number'])
        labels = [item for item in issue.labels if item.name == 'WIP']
        if labels:
            message = 'Code update recognized, countdown starts fresh.'
            _set_status(repostiory, pull_request, 'pending', message)

    def execute_edited(self):
        # TODO check PR and add message that this is under voting
        # print(self.data)
        # print('edited')
        # print(self.data.keys())
        # print(self.data['changes'])
        pass

    def execute_closed(self):
        # TODO Anything to do here?
        # print(self.data)
        # print(self.data.keys())
        pass

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
            mongo_repository = mongo.db.repositories.find_one({'full_name': data['repository']['id']})
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
                pr.contributors[reviewer] = {'name': reviewer, 'review_date': review['submitted_at']}

            value = 0
            if review['state'] == 'APPROVED':
                value = 1
            elif review['state'] == 'CHANGES_REQUESTED':
                value = -1

            pr.contributors[reviewer]['review_value'] = value

            pr.update_votes()
            pr.get_latest_dates()
            pr.get_merge_time()

            message = '''A new review, yeah.

            Votes: {}/{}
            Coefficient: {}
            Merging in {} days {} hours
            Age {} days {} hours'''.format(pr.votes, pr.votes_total, pr.coefficient, pr.days_to_merge.days, pr.days_to_merge.seconds / 3600, pr.age.days, pr.age.seconds / 3600)
            status_message = '{}/{} {} Merge in {} days {}'.format(pr.votes, pr.votes_total, round(pr.coefficient, 3) * 100, pr.days_to_merge.days, pr.days_to_merge.seconds / 3600)
            _set_status(repository, pull_request, 'success', status_message)
            issue = repository.get_issue(pull_request.number)
            issue.create_comment(message)

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

class Restart(flask_restful.Resource):
    def get(self):
        func = request.environ.get('werkzeug.server.shutdown')
        if func is None:
            raise RuntimeError('Not running with the Werkzeug Server')
        func()

api.add_resource(Restart, '/restart/')
api.add_resource(GithubWebHook, '/github/')

api.add_resource(apiendpoint.APIPullRequest, '/v1/<string:org>/<string:repo>/pull/<int:pull>/')
api.add_resource(apiendpoint.APIRepository, '/v1/<string:org>/<string:repo>/')

@sockets.route('/admin/logs')
def ws_admin_logs(ws):
    url = 'https://api.heroku.com/apps/worlddriven/log-sessions'
    headers = {
        'accept': 'application/vnd.heroku+json; version=3',
    }
    data = {
        'tail': True,
    }
    auth = (os.environ['HEROKU_EMAIL'], os.environ['HEROKU_TOKEN'])
    session_response = requests.post(url, headers=headers, auth=auth, data=data)
    log_session = session_response.json()
    log = requests.get(log_session['logplex_url'], headers=headers, auth=auth, stream=True)
    for line in log.iter_lines():
        if line:
            decoded_line = line.decode('utf-8')
            ws.send(decoded_line + '\n')
    print('end')

@app.route('/admin')
def admin():
    return app.send_static_file('admin.html')

@app.route('/admin/logs')
def admin_logs():
    url = 'https://api.heroku.com/apps/worlddriven/log-sessions'
    headers = {
        'accept': 'application/vnd.heroku+json; version=3',
    }
    data = {
        'source': 'app',
        'tail': True,
    }
    auth = (os.environ['HEROKU_EMAIL'], os.environ['HEROKU_TOKEN'])
    session_response = requests.post(url, headers=headers, auth=auth, data=data)
    log_session = session_response.json()
    log = requests.get(log_session['logplex_url'], headers=headers, auth=auth, stream=True)
    def generate():
        for line in log.iter_lines():
            if line:
                decoded_line = line.decode('utf-8')
                yield decoded_line + '\n'
    return Response(generate(), mimetype='text/plain')


sched = BackgroundScheduler()
sched.start()

sched.add_job(check_pull_requests, 'cron', hour='*', minute='*/51')

app.secret_key = os.getenv('SESSION_SECRET')

app.debug = os.getenv('DEBUG', 'false').lower() == 'true'

if __name__ == '__main__':
    # app.run(host='0.0.0.0', port=int(os.getenv("PORT", 5001)))
    from gevent import pywsgi
    from geventwebsocket.handler import WebSocketHandler
    server = pywsgi.WSGIServer(('', 5000), app, handler_class=WebSocketHandler)
    server.serve_forever()
