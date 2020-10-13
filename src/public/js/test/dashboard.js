import {Dashboard} from '../dashboard'; // eslint-disable-line no-unused-vars

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
      },
      {
        full_name: 'TooAngel/worlddriven',
        configured: true,
        pull_requests: [
          {number: 11},
        ],
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
    callback({pull_request: {
      title: 'Some cool new feature',
      mergeable: true,
      stats: {
        contributors: [
          {
            name: 'contributor',
            review_value: 5,
            commits: '4',
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
    }});
  }
}
