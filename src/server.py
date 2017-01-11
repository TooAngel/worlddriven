import os
from flask import Flask, request
from flask.ext import restful  # @UnresolvedImport


app = Flask(
    __name__,
    template_folder='../templates',
    static_folder='../static'
)
api = restful.Api(app)

class Github(restful.Resource):
    def post(self, name):
        data = request.json
        print(data)

api.add_resource(Github, '/github/')


if __name__ == '__main__':
    app.debug = os.getenv('DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=int(os.getenv("PORT", 5001)))
