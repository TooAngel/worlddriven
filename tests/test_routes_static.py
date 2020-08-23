import server
import unittest
import json
import base64
from mock import patch, MagicMock


class FrontendTestCase(unittest.TestCase):

    def setUp(self):
        server.app.testing = True
        self.app = server.app.test_client()

    def test_favicon_ico(self):
        rv = self.app.get(
            '/favicon.ico',
            base_url='https://localhost'
        )
        self.assertEqual(200, rv.status_code)

    def test_robots_txt(self):
        rv = self.app.get(
            '/robots.txt',
            base_url='https://localhost'
        )
        self.assertEqual(200, rv.status_code)

    def test_static_js_main_js(self):
        rv = self.app.get(
            '/static/js/main.js',
            base_url='https://localhost'
        )
        self.assertEqual(200, rv.status_code)

    def test_static_css_style_css(self):
        rv = self.app.get(
            '/static/css/style.css',
            base_url='https://localhost'
        )
        self.assertEqual(200, rv.status_code)

    def test_sitemap_xml(self):
        rv = self.app.get(
            '/sitemap.xml',
            base_url='https://localhost'
        )
        self.assertEqual(200, rv.status_code)

    def test_index(self):
        rv = self.app.get(
            '/',
            base_url='https://localhost'
        )
        self.assertEqual(200, rv.status_code)

    def test_dashboard(self):
        rv = self.app.get(
            '/dashboard',
            base_url='https://localhost'
        )
        self.assertEqual(200, rv.status_code)

if __name__ == '__main__':
    unittest.main()
