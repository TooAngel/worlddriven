import server
import unittest
import json
from mock import patch

class FrontendTestCase(unittest.TestCase):

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
        self.assertEqual(b'{"error": "No state"}\n', rv.data)

    @patch('server.PR')
    @patch('server.github')
    def test_get_pull(self, github, PR):
        def github_mock(token):
            print('Github')
        github = github_mock

        def PR_mock(token):
            print('PR')
        PR = PR_mock

        rv = self.app.get('/tooangel/democratic-collaboration/pull/2', base_url='https://localhost')
        self.assertEqual('200 OK', rv.status)

if __name__ == '__main__':
    unittest.main()
