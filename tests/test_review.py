import server
import unittest
import json

from mock import patch


class ReviewTestCase(unittest.TestCase):

    def setUp(self):
        server.app.testing = True
        self.app = server.app.test_client()

    def test_no_state(self):
        headers = {
            'Content-Type': 'application/json',
            'X-GitHub-Event': 'pull_request_review'
        }
        data = {
            'action': 'submitted',
            'review': {}
        }
        rv = self.app.post(
            '/github/',
            data=json.dumps(data),
            headers=headers,
            base_url='https://localhost'
        )
        data = json.loads(rv.data.decode('utf-8'))
        self.assertEqual('No state', data['error'])

    def test_commented(self):
        headers = {
            'Content-Type': 'application/json',
            'X-GitHub-Event': 'pull_request_review'
        }
        data = {
            'action': 'submitted',
            'review': {
                'state': 'commented'
            }
        }
        rv = self.app.post(
            '/github/',
            data=json.dumps(data),
            headers=headers,
            base_url='https://localhost'
        )
        data = json.loads(rv.data.decode('utf-8'))
        self.assertEqual('Only commented', data['info'])

    @patch('routes.githubWebHook.mongo')
    @patch('routes.githubWebHook.PR')
    @patch('routes.githubWebHook.github')
    def test_approve(self, github, PR, mongo):
        def PyMongo_mock(app):
            print('PyMongo_mock')
        PyMongo = PyMongo_mock

        def PR_mock(token):
            print('PR')
        PR = PR_mock

        def github_mock(token):
            print('Github')
        github = github_mock

        headers = {
            'Content-Type': 'application/json',
            'X-GitHub-Event': 'pull_request_review'
        }
        data = {
            'action': 'submitted',
            'review': {
                'state': 'approved',
                "user": {
                    "login": "user",
                },
                'submitted_at': 'submitted_at'
            },
            'repository': {
                'id': 'id'
            },
            'pull_request': {
                'number': 42
            }
        }
        rv = self.app.post(
            '/github/',
            data=json.dumps(data),
            headers=headers,
            base_url='https://localhost'
        )
        data = json.loads(rv.data.decode('utf-8'))
        self.assertEqual('All fine, thanks', data['info'])

if __name__ == '__main__':
    unittest.main()
