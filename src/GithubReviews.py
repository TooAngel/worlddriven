import requests
import os

def fetch_reviews(repository_full_name, pull_request_number):
    url = 'https://api.github.com/repos/{}/pulls/{}/reviews'.format(repository_full_name, pull_request_number)
    headers = {
    'Accept': 'application/vnd.github.black-cat-preview+json',
    'Authorization': 'token {}'.format(os.getenv('TOKEN'))
    }
    response = requests.get(url, headers=headers)
    if response.status_code == 404:
        # print(url)
        # print(response.content)
        # print('Status Code 404')
        return {}
    response.raise_for_status()
    data = response.json()

    if 'message' in data and data['message'] == 'Not Found':
        # print('message: Not Found')
        return {}

    return data
