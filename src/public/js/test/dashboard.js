import {Dashboard} from '../dashboard.js'; // eslint-disable-line no-unused-vars

/**
 * Dashboard class
 **/
export class TestDashboard extends Dashboard { // eslint-disable-line no-unused-vars
  /**
   * getUser - Returns dummy values
   *
   * @param {function} callback - The callback function
   * @return {void}
   **/
  getUser(callback) {
    callback({name: 'Test'});
  }

  /**
   * getRepositories - Returns dummy values
   *
   * @param {function} callback - The callback function
   * @return {void}
   **/
  getRepositories(callback) {
    callback([
      {
        full_name: 'TooAngel/screeps',
        configured: false,
        pull_requests: [
          {number: 11},
        ],
        description: 'Super cool screeps',
        html_url: 'https://github.com/TooAngel/screeps',
      },
      {
        full_name: 'TooAngel/worlddriven',
        configured: true,
        pull_requests: [
          {number: 11},
        ],
        description: 'Extreme cool World Driven',
        html_url: 'https://github.com/TooAngel/worlddriven',
      },
    ]);
  }

  /**
   * getPullRequest - Returns dummy values
   *
   * @param {string} repositoryFullName - The repository name
   * @param {integer} pullRequestNumber - The Pull Request number
   * @param {function} callback - The callback function
   * @return {void}
   **/
  getPullRequest(repositoryFullName, pullRequestNumber, callback) {
    let data = {pull_request: {
      title: 'Perfect attack',
      mergeable: true,
      stats: {
        contributors: [
          {
            name: 'contributor',
            review_value: -1,
            commits: '4',
            time_value: 7,
          },
          {
            name: 'contributor',
            review_value: 0,
            commits: '7',
            time_value: 7,
          },
          {
            name: 'contributor',
            review_value: 1,
            commits: '9',
            time_value: 7,
          },
        ],
        age: {},
        coefficient: 0.3,
        votes: 7,
        votes_total: 12,
      },
      org: 'testorg',
      repo: 'testrepo',
      number: 5,
      state: 'state',
      dates: {
        max: 123456789,
      },
      times: {
        days_to_merge: {
          merge_date: 1234567,

        },
        merge_duration: {

        },
      },
    }};
    if (repositoryFullName === 'TooAngel/worlddriven') {
      data = {
        pull_request: {
          title: 'Merger improvement',
          mergeable: false,
          stats: {
            contributors: [
              {
                name: 'contributor',
                review_value: -1,
                commits: '4',
                time_value: 7,
              },
              {
                name: 'contributor',
                review_value: 0,
                commits: '7',
                time_value: 7,
              },
              {
                name: 'contributor',
                review_value: 1,
                commits: '9',
                time_value: 7,
              },
            ],
            age: {},
            coefficient: 0.3,
            votes: 7,
            votes_total: 12,
          },
          org: 'testorg',
          repo: 'testrepo',
          number: 5,
          state: 'state',
          dates: {
            max: 123456789,
          },
          times: {
            days_to_merge: {
              merge_date: 1234567,

            },
            merge_duration: {

            },
          },
        },
      };
    }
    callback(data);
  }
}
