import os
from flask import Flask, request, redirect, url_for, session, g, Response, render_template
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
from flask_cors import CORS
import json
from datetime import timedelta

DOMAIN = 'https://www.worlddriven.org'

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

Compress(app)

api = flask_restful.Api(app)

app.config['MONGO_URI'] = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/worlddriven')
CORS(
    app,
    origins=['http://localhost:5000', DOMAIN],
    supports_credentials=True)
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

@app.route('/sitemap.xml')
def sitemapxml():
    return app.send_static_file('sitemap.xml')

@app.route('/')
def index():
    response = app.send_static_file('index.html')
    response.headers['server'] = None
    response.headers['X-XSS-Protection'] = '1; mode=block'
    return response

@app.route('/dashboard')
def dashboard():
    github_client = github.Github(g.user['github_access_token'])
    user = github_client.get_user()
    github_repositories = user.get_repos(type='public')
    repositories = []
    for repository in github_repositories:
        hooks = repository.get_hooks()

        configured = False
        for hook in hooks:
            if not hook.active:
                continue

            if 'url' not in hook.config:
                continue

            if hook.config['url'] == '{}/github/'.format(DOMAIN):
                configured = True
                break

        repositories.append({
            'full_name': repository.full_name,
            'configured': configured
        })

    return render_template(
        'dashboard.html',
        repositories=repositories,
        user=user
    )

@app.route('/<org_name>/<project_name>/pull/<int:pull_request_number>')
def show_pull_request(org_name, project_name, pull_request_number):
    if not g.user:
        return redirect('/')
    github_client = github.Github(g.user['github_access_token'])
    repository_name = '{}/{}'.format(org_name, project_name)
    repository = github_client.get_repo(repository_name)
    pull_request = repository.get_pull(pull_request_number)

    pr = PR(repository, pull_request)
    pr.get_contributors()
    pr.update_contributors_with_reviews()
    pr.update_votes()
    pr.get_latest_dates()
    pr.get_merge_time()
    contributors = [ pr.contributors[contributor] for contributor in pr.contributors ]
    for contributor in contributors:
        if 'commits' not in contributor:
            contributor['commits'] = 0;
        contributor['time_value'] = timedelta(days=(contributor['commits'] / float(pr.votes_total)) * pr.total_merge_time)

    def activeFirst(value):
        return abs(value['review_value'] + 0.1) * value['commits']
    contributors = sorted(contributors, key=activeFirst, reverse=True)

    return render_template(
        'pull_request.html',
        title=pull_request.title,
        repository=org_name,
        project=project_name,
        pull_request_number=pull_request_number,
        coefficient=pr.coefficient,
        votes=pr.votes,
        votes_total=pr.votes_total,
        contributors=contributors,
        max_date=pr.max_date,
        unlabel_date=pr.unlabel_date,
        push_date=pr.push_date,
        commit_date=pr.commit_date,
        pull_request_date=pr.pull_request_date,
        age=pr.age,
        commits=pr.commits,
        merge_duration=pr.merge_duration,
        days_to_merge=pr.days_to_merge,
        total_merge_time=pr.total_merge_time,
        merge_date=pr.max_date + pr.merge_duration
    )

@app.route('/login/')
def login():
    referer = request.headers.get('Referer', '/')
    session['referer'] = referer
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

def _set_status(repository, pull_request, state, message):
    commit = pull_request.get_commits()[0]
    commit.create_status(state, '', message, 'democratic collaboration')

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
        pr = PR(repository, pull_request)

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

        message = '''[democratic collaboration](https://github.com/TooAngel/democratic-collaboration)
Approved reviews will speed up the merge, request changes will slow it down.

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
            token = os.getenv('TOKEN')
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


if __name__ == '__main__':
    sched = BackgroundScheduler()
    sched.start()

    sched.add_job(check_pull_requests, 'cron', hour='*', minute='*/51')

    app.secret_key = os.getenv('SESSION_SECRET')

    app.debug = os.getenv('DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=int(os.getenv("PORT", 5001)))
