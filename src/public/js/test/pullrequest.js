import {PullRequest} from '../pullrequest.js'; // eslint-disable-line no-unused-vars

/**
 * PullRequest class
 **/
export class TestPullRequest extends PullRequest { // eslint-disable-line no-unused-vars
  /**
   * componentDidMount - after component mount
   *
   * @return {void}
   **/
  componentDidMount() {
    const pullRequest = {
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

        },
        merge_duration: {

        },
      },
    };
    this.setState({
      pullRequest: pullRequest,
      fetched: true,
    });
  }
}
