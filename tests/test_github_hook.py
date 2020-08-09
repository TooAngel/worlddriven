import server
import unittest
import json

from mock import patch, MagicMock


class ReviewTestCase(unittest.TestCase):

    def setUp(self):
        server.app.testing = True
        self.app = server.app.test_client()

    @patch('routes.githubWebHook.mongo')
    @patch('routes.githubWebHook.PR')
    @patch('routes.githubWebHook.github')
    def test_approve(self, github, PR, mongo):
        def PyMongo_mock(app):
            print('PyMongo_mock')
        PyMongo = PyMongo_mock

        PR_mock = MagicMock()
        PR.return_value = PR_mock
        PR_mock.days_to_merge.days = 5

        class Commit_mock():
            def create_status(self, state, target_url, description, context):
                pass

        PullRequest_mock = MagicMock()

        class Repository_mock():
            def get_pull(repo, pull_number):
                return PullRequest_mock

        class Github_mock():
            def get_repo(self, repo_id):
                return Repository_mock()

        github.Github.return_value = Github_mock()

        headers = {
            'Content-Type': 'application/json',
            'X-GitHub-Event': 'pull_request'
        }
        data = {
            'action': 'opened',
            'repository': {
                'id': 'id',
                'full_name': 'test/repository'
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

        PullRequest_mock.create_issue_comment.assert_called_with('This pull request will be automatically merged by [worlddriven](https://www.worlddriven.org) in 5 days.\n\n        `Approved` reviews will speed this up.\n        `Request Changes` reviews will slow it down or stop it.\n        ')
        self.assertEqual('All fine, thanks', data['info'])

if __name__ == '__main__':
    unittest.main()
