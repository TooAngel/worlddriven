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
    def test_pull_request_opened(self, github, PR, mongo):
        def PyMongo_mock(app):
            print('PyMongo_mock')
        PyMongo = PyMongo_mock

        PR_mock = MagicMock()
        PR.return_value = PR_mock
        PR_mock.votes = 1
        PR_mock.votes_total = 2
        PR_mock.coefficient = 0.5
        PR_mock.days_to_merge.seconds = 55
        PR_mock.days_to_merge.days = 5

        Commit_mock = MagicMock();

        PullRequest_mock = MagicMock()
        PullRequest_mock.get_commits.return_value = [Commit_mock]

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

        self.assertEqual('All fine, thanks', data['info'])
        PullRequest_mock.create_issue_comment.assert_called_with('This pull request will be automatically merged by [worlddriven](https://www.worlddriven.org) in 5 days.\n\n        `Approved` reviews will speed this up.\n        `Request Changes` reviews will slow it down or stop it.\n        ')
        Commit_mock.create_status.assert_called_with('success', '', '1/2 50.0 Merge in 5 days 0.015277777777777777', 'worlddriven')

if __name__ == '__main__':
    unittest.main()
