import logging
from datetime import datetime, timedelta
import os
import github
import requests

def get_reviews(repo, number):
    url = 'https://api.github.com/repos/{}/pulls/{}/reviews'.format(repo.full_name, number)
    headers = {
    'Accept': 'application/vnd.github.black-cat-preview+json',
    'Authorization': 'token {}'.format(os.getenv('TOKEN'))
    }
    response = requests.get(url, headers=headers)
    if response.status_code == 404:
        print(url)
        print(response.content)
        print('Status Code 404')
        return {}
    response.raise_for_status()
    data = response.json()
    if 'message' in data and data['message'] == 'Not Found':
        print('message: Not Found')
        return {}
    reviews_decided = [review for review in data if review['state'] != 'COMMENTED']
    last_reviews = {}
    for review in reviews_decided:
        if review['user']['login'] not in last_reviews:
            last_reviews[review['user']['login']] = review
            continue
        if toDateTime(last_reviews[review['user']['login']]['submitted_at']) < toDateTime(review['submitted_at']):
            last_reviews[review['user']['login']] = review
            continue
    return last_reviews


def toDateTime(value):
    return datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ')


def mergeable_pull_request(pull_request):
    return not pull_request.title.startswith('[WIP]')

def get_contributors(repository_name):
    token = os.getenv('TOKEN')
    github_client = github.Github(token)
    repository = github_client.get_repo(repository_name)
    return repository.get_stats_contributors()

def get_votes_from_reviews(votes, repository, pull_request, possible_reviewers):
    reviews = get_reviews(repository, pull_request.number)
    for review in reviews:
        if review not in possible_reviewers:
            print('{} not in reviewers'.format(review))
            continue
        if reviews[review]['state'] == 'APPROVED':
            votes += possible_reviewers[review]
            continue
        if reviews[review]['state'] == 'CHANGES_REQUESTED':
            votes -= possible_reviewers[review]
            continue
        print(reviews[review]['state'])
    return votes

def get_coefficient_and_votes(repository, pull_request):
    contributors = {contributor.author.login: contributor.total for contributor in (get_contributors(repository.id) or []) if contributor.author}
    author = pull_request.user.login
    possible_reviewers = {contributor: contributors[contributor] for contributor in contributors if contributor != author}

    # Sum of total number of commits, initialize votes with the authors weight
    votes_total = sum(contributors[contributor] for contributor in contributors)
    votes = 0
    if author in contributors:
        votes = contributors[author]

    votes = get_votes_from_reviews(votes, repository, pull_request, possible_reviewers)

    coefficient = 0
    if votes_total != 0:
        coefficient = float(votes) / float(votes_total)
    return {'coefficient': coefficient, 'votes': votes, 'votes_total': votes_total}


def get_last_date(data):
    data_sorted = sorted(data, key=lambda event: event.created_at, reverse=True)
    return data_sorted[0].created_at if len(data_sorted) > 0 else datetime(1960, 1, 1)


def check_pull_request(repository, pull_request, commentOnIssue):
    print(pull_request.title.encode('utf-8'))

    if not mergeable_pull_request(pull_request):
        issue = repository.get_issue(pull_request.number)
        labels = [item for item in issue.labels if item.name == 'WIP']
        if not labels:
            print('Set WIP label')
            issue.add_to_labels('WIP')
            issue.create_comment('Adding WIP label, the title is prefixed with [WIP]')
        return

    issue = repository.get_issue(pull_request.number)
    labels = [item for item in issue.labels if item.name == 'WIP']
    if labels:
        print('Remove label')
        issue.remove_from_labels(labels[0])
        issue.create_comment('''Removing WIP label, the title is not prefixed with [WIP]''')

    data_math = get_coefficient_and_votes(repository, pull_request)
    if data_math['coefficient'] < 0:
        print('Negative coefficient')
        return

    issue_events = [event for event in issue.get_events() if event.event == 'unlabeled' and event.raw_data['label']['name'] == 'WIP']
    last_unlabel_date = get_last_date(issue_events)

    events = [event for event in pull_request.head.repo.get_events() if event.type == 'PushEvent' and event.payload['ref'] == 'refs/heads/{}'.format(pull_request.head.ref)]
    last_push_date = get_last_date(events)

    commits = pull_request.get_commits()
    commit = max(commits, key=lambda commit: commit.commit.author.date)

    last_commit_date = commit.commit.author.date
    # print('pull request created', pull_request.created_at)
    # print('commit date:', last_commit_date)
    # print('unlabel date:', last_unlabel_date)
    # print('push date', last_push_date)
    max_date = max(last_commit_date, last_unlabel_date, last_push_date, pull_request.created_at)
    # print('max date', max_date)
    age = datetime.now() - max_date
    check_for_merge(data_math['coefficient'], pull_request, issue, age, data_math['votes'], data_math['votes_total'], commentOnIssue)

def check_for_merge(coefficient, pull_request, issue, age, votes, votes_total, commentOnIssue):
    # Formular:
    # 5 days base value
    # commits in pull request times 5 days
    # days_to_merge = (1 - coefficient) * calculated days
    merge_duration = timedelta(days=(1 - coefficient) * (5 + pull_request.commits * 5))
    days_to_merge = merge_duration - age
    message = '''A new review, yeah.

    Votes: {}/{}
    Coefficient: {}
    Merging in {} days {} hours
    Age {} days {} hours'''.format(votes, votes_total, coefficient, days_to_merge.days, days_to_merge.seconds / 3600, age.days, age.seconds / 3600)
    print(message)
    if commentOnIssue:
        issue.create_comment(message)

    if age >= days_to_merge:
        print('Would merge now')
        try:
            pull_request.merge()
        except Exception as e:
            # Maybe add a comment that the conflicts should be resolved
            print(e)


def check_pull_requests():
    logging.info('Check pull requests: {}'.format(datetime.now()))
    token = os.getenv('TOKEN')
    github_client = github.Github(token)
    repositories = ['tooangel/democratic-collaboration', 'tooangel/screeps']

    for repository_name in repositories:
        repository = github_client.get_repo(repository_name)
        for pull_request in repository.get_pulls():
            check_pull_request(repository, pull_request, False)
