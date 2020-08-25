import PullRequest
import unittest
from mock import patch, MagicMock
from datetime import datetime, timedelta


class SchedulerTestCase(unittest.TestCase):

    @patch('PullRequest.MongoClient')
    @patch('PullRequest.logging')
    @patch('PullRequest.fetch_reviews')
    @patch('PullRequest.github')
    def test_not_merging_changes_requested(self, github, fetch_reviews, logging, mongoClient):
        contributor_author = MagicMock()
        contributor_author.login = 'reviewer'

        contributor = MagicMock()
        contributor.author = contributor_author
        contributor.total = 1

        repository = MagicMock()
        repository.get_stats_contributors.return_value = [contributor]

        fetch_reviews.return_value = [
            {
                'state': 'CHANGES_REQUESTED',
                'submitted_at': datetime.now() - timedelta(days=10),
                'user': {
                    'login': 'reviewer'
                }
            }
        ]

        user = MagicMock()
        user.login = 'login'
        user.date = 5

        commit = MagicMock()
        commit.author = user
        commit.commit.author.date = datetime.now() - timedelta(days=23)

        commits = MagicMock()
        commits.reversed = [commit]

        pull_request = MagicMock()
        pull_request.get_commits.return_value = commits
        pull_request.title = 'title'
        pull_request.user = user
        pull_request.commits = 1
        pull_request.created_at = datetime.now() - timedelta(days=24)

        commentOnIssue = False
        token = ''

        pr = PullRequest.check_pull_request(repository, pull_request, commentOnIssue, token)

        assert not pull_request.merge.called

    @patch('PullRequest.MongoClient')
    @patch('PullRequest.logging')
    @patch('PullRequest.fetch_reviews')
    @patch('PullRequest.github')
    def test_get_pull(self, github, fetch_reviews, logging, mongoClient):
        database = MagicMock()
        database.repositories.find.return_value = [{
            '_id': '4',
            'full_name': 'test',
            'github_access_token': 'github_access_token'
        }]

        mongo = MagicMock()
        mongo.get_database.return_value = database
        mongoClient.return_value = mongo

        user = MagicMock()
        user.login = 'login'
        user.date = 5
        pull = MagicMock()
        pull.title = 'title'
        pull.user = user
        pull.commits = 4
        pull.created_at = datetime.now() - timedelta(days=2)

        commit = MagicMock()
        commit.author = user
        commit.commit.author.date = datetime.now() - timedelta(days=1)

        commits = MagicMock()
        commits.reversed = [commit]

        pull.get_commits.return_value = commits

        contributor = MagicMock()
        contributor.total = 10
        contributor.author = user

        repo = MagicMock()
        repo.get_stats_contributors.return_value = [
            contributor
        ]

        github_object = MagicMock()
        github.Github.return_value = github_object
        pulls = [
            pull
        ]

        github_object.get_repo.return_value = repo
        repo.get_pulls.return_value = pulls

        def fetch_reviews_mock(token):
            print('fetch_reviews')
        fetch_reviews = fetch_reviews_mock

        PullRequest.check_pull_requests()
        self.assertEqual(
            logging.info.call_args_list[1],
            (('Repository: test 4',),)
        )
        self.assertEqual(
            logging.info.call_args_list[2],
            ((b'title',),)
        )
        self.assertEqual(
            logging.info.call_args_list[4],
            (('Would merge now',),)
        )


if __name__ == '__main__':
    unittest.main()
