import logging
from datetime import datetime, timedelta
import os
import github
import requests

def get_reviews(repository, pull_request, contributors):
    url = 'https://api.github.com/repos/{}/pulls/{}/reviews'.format(repository.full_name, pull_request.number)
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
    for review in reviews_decided:
        value = 0
        if review['state'] == 'APPROVED':
            value = 1
        elif review['state'] == 'CHANGES_REQUESTED':
            value = -1
        if review['user']['login'] not in contributors:
            contributors[review['user']['login']] = {'name': review['user']['login'], 'review_value': value, 'review_date': review['submitted_at']}
            continue
        if 'review_date' not in contributors[review['user']['login']] or toDateTime(contributors[review['user']['login']]['review_date']) < toDateTime(review['submitted_at']):
            contributors[review['user']['login']]['review_value'] = value
            contributors[review['user']['login']]['review_date'] = review['submitted_at']
            continue

    contributors[pull_request.user.login]['review_value'] = 1

    return contributors


def toDateTime(value):
    return datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ')


def mergeable_pull_request(pull_request):
    return not pull_request.title.startswith('[WIP]')

def get_contributors(repository):
    contributors = repository.get_stats_contributors()
    return {contributor.author.login: {'review_value': 0, 'name': contributor.author.login, 'commits': contributor.total} for contributor in (contributors or []) if contributor.author}

def get_votes_from_reviews(votes, repository, pull_request, contributors):
    reviews = get_reviews(repository, pull_request, contributors)
    for review in reviews:
        if review not in contributors:
            print('{} not in reviewers'.format(review))
            continue
        votes += reviews[review].get('review_value', 0) * contributors[review].get('commits', 0)
    return votes

def get_coefficient_and_votes(repository, pull_request):
    contributors = get_contributors(repository)
    author = pull_request.user.login
    contributors = get_reviews(repository, pull_request, contributors)
    # Sum of total number of commits, initialize votes with the authors weight
    votes_total = sum(contributors[contributor].get('commits', 0) for contributor in contributors)
    votes = 0

    votes = get_votes_from_reviews(votes, repository, pull_request, contributors)
    print(votes, votes_total)
    coefficient = 0
    if votes_total != 0:
        coefficient = float(votes) / float(votes_total)
    return {
        'coefficient': coefficient,
        'votes': votes,
        'votes_total': votes_total,
        'contributors': contributors
    }


def get_last_date(data):
    data_sorted = sorted(data, key=lambda event: event.created_at, reverse=True)
    return data_sorted[0].created_at if len(data_sorted) > 0 else datetime(1960, 1, 1)


def get_latest_dates(repository, pull_request):
    issue = repository.get_issue(pull_request.number)
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
    age = datetime.now() - max_date
    return {
        'max_date': max_date,
        'unlabel_date': last_unlabel_date,
        'push_date': last_push_date,
        'commit_date': last_commit_date,
        'pull_request_date': pull_request.created_at,
        'age': age
    }

def check_pull_request(repository, pull_request, commentOnIssue):
    print('-' * 20)
    print(pull_request.title.encode('utf-8'))

    if not mergeable_pull_request(pull_request):
        issue = repository.get_issue(pull_request.number)
        labels = [item for item in issue.labels if item.name == 'WIP']
        if not labels:
            print('Set WIP label')
            issue.add_to_labels('WIP')
            _set_status(repository, pull_request, 'error', 'The title is prefixed with [WIP]')
        return

    issue = repository.get_issue(pull_request.number)
    labels = [item for item in issue.labels if item.name == 'WIP']
    if labels:
        print('Remove label')
        issue.remove_from_labels(labels[0])


    data_math = get_coefficient_and_votes(repository, pull_request)
    if data_math['coefficient'] < 0:
        print('Negative coefficient')
        return

    dates = get_latest_dates(repository, pull_request)
    check_for_merge(data_math['coefficient'], repository, pull_request, issue, dates['age'], data_math['votes'], data_math['votes_total'], commentOnIssue)


def get_merge_time(pull_request, coefficient, age):
    total_merge_time = (5 + pull_request.commits * 5)
    merge_duration = timedelta(days=(1 - coefficient) * total_merge_time)
    days_to_merge = merge_duration - age
    return {
        'commits': pull_request.commits,
        'merge_duration': merge_duration,
        'days_to_merge': days_to_merge,
        'total_merge_time': total_merge_time,
    }

def check_for_merge(coefficient, repository, pull_request, issue, age, votes, votes_total, commentOnIssue):
    # Formular:
    # 5 days base value
    # commits in pull request times 5 days
    # days_to_merge = (1 - coefficient) * calculated days
    times = get_merge_time(pull_request, coefficient, age)
    merge_duration = timedelta(days=(1 - coefficient) * (5 + pull_request.commits * 5))
    days_to_merge = merge_duration - age
    message = '''A new review, yeah.

    Votes: {}/{}
    Coefficient: {}
    Merging in {} days {} hours
    Age {} days {} hours'''.format(votes, votes_total, coefficient, times['days_to_merge'].days, times['days_to_merge'].seconds / 3600, age.days, age.seconds / 3600)
    print(message)

    status_message = '{}/{} {} Merge in {} days {}'.format(votes, votes_total, round(coefficient, 3) * 100, days_to_merge.days, days_to_merge.seconds / 3600)
    _set_status(repository, pull_request, 'success', status_message)

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

def _set_status(repository, pull_request, state, message):
    commit = pull_request.get_commits().reversed[0]
    url = 'https://dc.tooangel.de/{}/pull/{}'.format(repository.full_name, pull_request.number)
    print(commit.create_status(state, url, message, 'democratic collaboration'))
