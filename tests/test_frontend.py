import server
import unittest
import json
import base64
from mock import patch, MagicMock

class FrontendTestCase(unittest.TestCase):

    def setUp(self):
        server.app.testing = True
        server.app.config['SECRET_KEY'] = 'sekrit!'
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
        self.assertEqual(b'{\n    "error": "No state"\n}\n', rv.data)

    @patch('server.PR')
    @patch('server.github')
    def test_get_pull_not_logged_in(self, github, PR):
        def github_mock(token):
            print('Github')
        github = github_mock

        def PR_mock(token):
            print('PR')
        PR = PR_mock

        rv = self.app.get('/tooangel/worlddriven/pull/2', base_url='https://localhost')
        self.assertEqual('200 OK', rv.status)

    @patch('server.mongo')
    @patch('server.PR')
    @patch('server.github')
    def test_get_pull_logged_in(self, github, PR, mongoClient):

        find_one = MagicMock()
        find_one.return_value = [{'full_name': 'test', 'github_access_token': 'github_access_token'}]
        mongoClient.mongo.db.users.find_one = find_one

        def github_mock(token):
            print('Github')
        github = github_mock

        def PR_mock(token):
            print('PR')
        PR = PR_mock

        with self.app as c:
            with c.session_transaction() as sess:
                sess['user_id'] = '1234567890AB1234567890AB'
            rv = c.get('/tooangel/worlddriven/pull/2', base_url='https://localhost')
        self.assertEqual('200 OK', rv.status)

if __name__ == '__main__':
    unittest.main()
