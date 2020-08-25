import server
import unittest
import json
from datetime import datetime, timedelta

from mock import patch, MagicMock


class GithubHookTestCase(unittest.TestCase):

    def setUp(self):
        server.app.testing = True
        self.app = server.app.test_client()

    def test_push(self):
        headers = {
            'Content-Type': 'application/json',
            'X-GitHub-Event': 'push'
        }

        data = {}

        rv = self.app.post(
            '/github/',
            data=json.dumps(data),
            headers=headers,
            base_url='https://localhost'
        )
        response = json.loads(rv.data.decode('utf-8'))

        self.assertEqual('All fine, thanks', response['info'])


if __name__ == '__main__':
    unittest.main()
