from flask import Blueprint, render_template, send_file

static = Blueprint(
    'static',
    __name__,
    static_folder='../../static',
    template_folder='../../templates'
)


@static.route('/favicon.ico')
def favicon():
    return static.send_static_file('images/favicon.png')


@static.route('/robots.txt')
def robotstxt():
    return static.send_static_file('robots.txt')


@static.route('/static/js/main.js')
def main_js():
    return send_file('../dist/main.js')


@static.route('/static/css/style.css')
def style_css():
    return send_file('../static/style.css')


@static.route('/sitemap.xml')
def sitemapxml():
    return static.send_static_file('sitemap.xml')


@static.route('/')
def index():
    response = static.send_static_file('index.html')
    response.headers['server'] = None
    response.headers['X-XSS-Protection'] = '1; mode=block'
    return response


@static.route('/dashboard')
def dashboard():
    return static.send_static_file('dashboard.html')
