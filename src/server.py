import os
from flask import Flask, request, redirect, url_for, session, g, Response, render_template, send_file
import flask_restful
from flask_compress import Compress
from flask_session import Session
from flask_sslify import SSLify
import github
from apscheduler.schedulers.background import BackgroundScheduler
import requests
import sys
from random import randrange
from flask_pymongo import PyMongo
from flask_github import GitHub
import logging
from PullRequest import PullRequest as PR, check_pull_requests
from bson.objectid import ObjectId
import json
from datetime import timedelta
from flask_sockets import Sockets

from routes.static import static
import apiendpoint
import routes.githubWebHook

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s %(message)s',
                    handlers=[logging.StreamHandler()])

app = Flask(
    __name__,
    static_folder='../static',
    template_folder='../templates'
)

mongo_uri = os.getenv(
    'MONGODB_URI',
    'mongodb://localhost:27017/worlddriven'
) + '?retryWrites=false'
app.config['MONGO_URI'] = mongo_uri
mongo = PyMongo(app)

mongo_parts = mongo_uri.split('/')
mongo_db = mongo_parts.pop().split('?')[0   ]

SESSION_TYPE = 'mongodb'
SESSION_MONGODB = mongo.cx
SESSION_MONGODB_DB = mongo_db
SESSION_MONGODB_COLLECT = 'sessions'

app.config.from_object(__name__)
Session(app)

app.register_blueprint(static)

if not os.getenv('DEBUG'):
    sslify = SSLify(app, permanent=True)

sockets = Sockets(app)
Compress(app)

api = flask_restful.Api(app)

apiendpoint.mongo = mongo
routes.githubWebHook.mongo = mongo

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

@app.route('/v1/repositories')
def repositories():
    if not g.user:
        return 401;

    github_client = github.Github(g.user['github_access_token'])
    user = github_client.get_user()
    github_repositories = user.get_repos(type='owner')

    query = {'$or': []}
    repositories = {}
    for repository in github_repositories:
        repositories[repository.full_name] = False
        query['$or'].append({'full_name': repository.full_name})

    organizations = user.get_orgs()
    for organization in organizations:
        for repository in organization.get_repos('public'):
            repositories[repository.full_name] = False
            query['$or'].append({'full_name': repository.full_name})

    mongo_repositories = mongo.db.repositories.find(query)
    for mongo_repository in mongo_repositories:
        repositories[mongo_repository['full_name']] = True

    response = []
    for key, value in repositories.items():
        response.append({
            'full_name': key,
            'configured': value
        })
    response = sorted(response, key = lambda i: i['full_name'])
    return Response(json.dumps(response),  mimetype='application/json')


@app.route('/<org_name>/<project_name>/pull/<int:pull_request_number>')
def show_pull_request(org_name, project_name, pull_request_number):
    return app.send_static_file('pull_request.html')


@app.route('/login/')
def login():
    if session.get('user_id', None) is None:
        return github_oauth.authorize(scope='public_repo,read:org,admin:repo_hook')
    else:
        return redirect('/dashboard')


@app.route('/logout/')
def logout():
    session.clear()
    return redirect('/')


@app.route('/github-callback/')
@github_oauth.authorized_handler
def authorized(oauth_token):
    if oauth_token is None:
        logging.info("Authorization failed.")
        return redirect(redirect_url)

    user = mongo.db.users.find_one({'github_access_token': oauth_token})
    if not user:
        insert = mongo.db.users.insert_one({
            'github_access_token': oauth_token
        })
        user = mongo.db.users.find_one({'_id': insert.inserted_id})

    session['user_id'] = user['_id']
    return redirect('/dashboard')


@app.route('/v1/user/')
def user():
    return Response(
        json.dumps(github_oauth.get('user')),
        mimetype='application/json'
    )

api.add_resource(routes.githubWebHook.GithubWebHook, '/github/')

api.add_resource(
    apiendpoint.APIPullRequest,
    '/v1/<string:org>/<string:repo>/pull/<int:pull>/'
)
api.add_resource(
    apiendpoint.APIRepository,
    '/v1/<string:org>/<string:repo>/'
)


@sockets.route('/admin/logs')
def ws_admin_logs(ws):
    logging.info('websocket connection started')
    url = 'https://api.heroku.com/apps/worlddriven/log-sessions'
    headers = {
        'accept': 'application/vnd.heroku+json; version=3',
    }
    data = {
        'tail': True,
    }
    auth = (os.environ['HEROKU_EMAIL'], os.environ['HEROKU_TOKEN'])
    session_response = requests.post(
        url,
        headers=headers,
        auth=auth,
        data=data
    )
    log_session = session_response.json()
    log = requests.get(
        log_session['logplex_url'],
        headers=headers,
        auth=auth,
        stream=True
    )
    for line in log.iter_lines():
        if line:
            decoded_line = line.decode('utf-8')
            if ws.closed:
                break
            try:
                ws.send(decoded_line + '\n')
            except Exception as e:
                logging.error('error args {} errno {} strerror {}'.format(e.args, e.errno, e.strerror))
                logging.error('/admin/logs ws.send() exception {}'.format(e))
                break

    logging.info('websocket connection ended')


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
    session_response = requests.post(
        url,
        headers=headers,
        auth=auth,
        data=data
    )
    log_session = session_response.json()
    log = requests.get(
        log_session['logplex_url'],
        headers=headers,
        auth=auth,
        stream=True
    )

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
