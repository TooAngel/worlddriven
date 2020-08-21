import server
import unittest
import json
from datetime import datetime, timedelta

from mock import patch, MagicMock


class GithubHookTestCase(unittest.TestCase):

    def setUp(self):
        server.app.testing = True
        self.app = server.app.test_client()

    @patch('PullRequest.fetch_reviews')
    @patch('routes.githubWebHook.mongo')
    @patch('routes.githubWebHook.github')
    def test_pull_request_opened(self, github, mongo, fetch_reviews):
        def PyMongo_mock(app):
            print('PyMongo_mock')
        PyMongo = PyMongo_mock

        Commit_mock = MagicMock();
        Commit_mock.commit.author.date = datetime.utcnow()

        Get_commits_mock = MagicMock()
        Get_commits_mock.reversed = [Commit_mock]

        PullRequest_mock = MagicMock()
        PullRequest_mock.get_commits.return_value = Get_commits_mock
        PullRequest_mock.number = 42
        PullRequest_mock.created_at = datetime.utcnow()
        PullRequest_mock.commits = 1

        Repository_mock = MagicMock()
        Repository_mock.get_pull.return_value = PullRequest_mock
        Repository_mock.full_name = 'test'

        Github_mock = MagicMock()
        Github_mock.get_repo.return_value = Repository_mock

        github.Github.return_value = Github_mock

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
        PullRequest_mock.create_issue_comment.assert_called_with('This pull request will be automatically merged by [worlddriven](https://www.worlddriven.org) in 9 days and 23 hours.\nCheck the `worlddriven` status checks or the [dashboard](https://www.worlddriven.org/test/pull/42) for actual stats.\n\n`Approved` reviews will speed this up.\n`Request Changes` reviews will slow it down or stop it.')
        Commit_mock.create_status.assert_called_with('success', 'https://www.worlddriven.org/test/pull/42', '0 Merge at {}'.format(PullRequest_mock.created_at + timedelta(days=10)), 'World driven')

    @patch('routes.githubWebHook.logging')
    @patch('routes.githubWebHook.mongo')
    @patch('routes.githubWebHook.PR')
    @patch('routes.githubWebHook.github')
    def test_pull_request_synchronize(self, github, PR, mongo, logging):
        def PyMongo_mock(app):
            print('PyMongo_mock')
        PyMongo = PyMongo_mock

        PullRequest_mock = MagicMock()
        PullRequest_mock.number = 42

        Repository_mock = MagicMock()
        Repository_mock.get_pull.return_value = PullRequest_mock
        Repository_mock.full_name = 'test'

        class Github_mock():
            def get_repo(self, repo_id):
                return Repository_mock

        github.Github.return_value = Github_mock()

        headers = {
            'Content-Type': 'application/json',
            'X-GitHub-Event': 'pull_request'
        }
        data = {
            'action': 'synchronize',
        }
        rv = self.app.post(
            '/github/',
            data=json.dumps(data),
            headers=headers,
            base_url='https://localhost'
        )
        print(self.app)
        print(rv.data)
        data = json.loads(rv.data.decode('utf-8'))

        self.assertEqual('All fine, thanks', data['info'])
        logging.info.assert_called_with("execute_synchronize {'action': 'synchronize'}");

    @patch('routes.githubWebHook.logging')
    @patch('routes.githubWebHook.mongo')
    @patch('routes.githubWebHook.PR')
    @patch('routes.githubWebHook.github')
    def test_pull_request_edited(self, github, PR, mongo, logging):
        def PyMongo_mock(app):
            print('PyMongo_mock')
        PyMongo = PyMongo_mock

        PullRequest_mock = MagicMock()
        PullRequest_mock.number = 42

        Repository_mock = MagicMock()
        Repository_mock.get_pull.return_value = PullRequest_mock
        Repository_mock.full_name = 'test'

        class Github_mock():
            def get_repo(self, repo_id):
                return Repository_mock

        github.Github.return_value = Github_mock()

        headers = {
            'Content-Type': 'application/json',
            'X-GitHub-Event': 'pull_request'
        }
        data = {
            'action': 'edited',
        }
        rv = self.app.post(
            '/github/',
            data=json.dumps(data),
            headers=headers,
            base_url='https://localhost'
        )
        print(self.app)
        print(rv.data)
        data = json.loads(rv.data.decode('utf-8'))

        self.assertEqual('All fine, thanks', data['info'])
        logging.info.assert_called_with("execute_edited {'action': 'edited'}");

    @patch('routes.githubWebHook.logging')
    @patch('routes.githubWebHook.mongo')
    @patch('routes.githubWebHook.PR')
    @patch('routes.githubWebHook.github')
    def test_pull_request_closed(self, github, PR, mongo, logging):
        def PyMongo_mock(app):
            print('PyMongo_mock')
        PyMongo = PyMongo_mock

        PullRequest_mock = MagicMock()
        PullRequest_mock.number = 42

        Repository_mock = MagicMock()
        Repository_mock.get_pull.return_value = PullRequest_mock
        Repository_mock.full_name = 'test'

        class Github_mock():
            def get_repo(self, repo_id):
                return Repository_mock

        github.Github.return_value = Github_mock()

        headers = {
            'Content-Type': 'application/json',
            'X-GitHub-Event': 'pull_request'
        }
        data = {
            'action': 'closed',
        }
        rv = self.app.post(
            '/github/',
            data=json.dumps(data),
            headers=headers,
            base_url='https://localhost'
        )
        print(self.app)
        print(rv.data)
        data = json.loads(rv.data.decode('utf-8'))

        self.assertEqual('All fine, thanks', data['info'])
        logging.info.assert_called_with("execute_closed {'action': 'closed'}");

if __name__ == '__main__':
    unittest.main()
