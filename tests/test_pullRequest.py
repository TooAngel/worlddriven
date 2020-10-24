import PullRequest
import unittest
from mock import patch, MagicMock
from datetime import datetime, timedelta


class PullRequestTestCase(unittest.TestCase):

    @patch('PullRequest.Repository')
    @patch('PullRequest.logging')
    @patch('PullRequest.fetch_reviews')
    @patch('PullRequest.github')
    def test_config(self, github, fetch_reviews, logging, db_repository):
        contributor_author = MagicMock()
        contributor_author.login = 'reviewer'

        contributor = MagicMock()
        contributor.author = contributor_author
        contributor.total = 1

        contributor_2nd_author = MagicMock()
        contributor_2nd_author.login = '2nd'

        contributor_2nd = MagicMock()
        contributor_2nd.author = contributor_2nd_author
        contributor_2nd.total = 1

        repository = MagicMock()
        repository.get_stats_contributors.return_value = [contributor, contributor_2nd]

        fetch_reviews.return_value = [
            {
                'state': 'APPROVED',
                'submitted_at': datetime.now() - timedelta(days=2),
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
        commit.commit.author.date = datetime.now() - timedelta(days=3)

        commits = MagicMock()
        commits.reversed = [commit]

        pull_request = MagicMock()
        pull_request.get_commits.return_value = commits
        pull_request.title = 'title'
        pull_request.user = user
        pull_request.commits = 1
        pull_request.created_at = datetime.now() - timedelta(days=4)

        commentOnIssue = False
        token = ''

        # Do not merge with default config
        pr = PullRequest.check_pull_request(repository, pull_request, commentOnIssue, token)
        assert not pull_request.merge.called

        content = MagicMock()
        content.decoded_content = b"""
[DEFAULT]
baseMergeTimeInHours = 20
perCommitTimeInHours = 20
"""

        # Merge with updated config
        repository.get_contents.return_value = content

        pr = PullRequest.check_pull_request(repository, pull_request, commentOnIssue, token)
        assert pull_request.merge.called


if __name__ == '__main__':
    unittest.main()
