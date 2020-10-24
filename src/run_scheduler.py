from PullRequest import check_pull_requests
import logging
from models import Repository, User, db
from flask import Flask
import os

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s %(message)s',
                    handlers=[logging.StreamHandler()])

if __name__ == '__main__':
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('POSTGRESQL_URI', 'postgresql://worlddriven:password@localhost/worlddriven')
    db.init_app(app)
    with app.app_context():
        check_pull_requests()
