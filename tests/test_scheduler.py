import PullRequest
import unittest
from mock import patch, MagicMock
from datetime import datetime, timedelta


class SchedulerTestCase(unittest.TestCase):

    @patch('PullRequest.MongoClient')
    @patch('PullRequest.logging')
    @patch('PullRequest.fetch_reviews')
    @patch('PullRequest.github')
    def test_get_pull(self, github, fetch_reviews, logging, mongoClient):
        database = MagicMock()
        database.repositories.find.return_value = [
            {'full_name': 'test', 'github_access_token': 'github_access_token'}
        ]

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
        print(logging.info.call_args)
        self.assertEqual(
            logging.info.call_args_list[1],
            (('Repository: test',),)
        )
        self.assertEqual(
            logging.info.call_args_list[2],
            (('--------------------',),)
        )
        self.assertEqual(
            logging.info.call_args_list[3],
            ((b'title',),)
        )
        self.assertEqual(
            logging.info.call_args_list[5],
            (('Would merge now',),)
        )


if __name__ == '__main__':
    unittest.main()
