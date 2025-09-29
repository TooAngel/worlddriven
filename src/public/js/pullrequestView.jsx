import React from 'react';
import PropTypes from 'prop-types';
import styles from '../../../static/css/pullRequest.module.css';

/**
 * PullRequest class
 **/
export class PullRequestView extends React.Component {
  // eslint-disable-line no-unused-vars
  /**
   * contructor - The constructor
   *
   * @param {object} props - The properties
   * @return {void}
   **/
  constructor(props) {
    super(props);
    this.state = {
      pullRequest: props.pullRequest || null,
    };
  }

  /**
   * getPullRequests
   */
  async getPullRequest() {
    // If pullRequest was passed directly as a prop, don't fetch
    if (this.props.pullRequest) {
      return;
    }

    if (!this.props.repository?.fullName) {
      console.error(
        'Repository or fullName is missing:',
        this.props.repository
      );
      return;
    }

    try {
      const response = await fetch(
        `/v1/repositories/${this.props.repository.fullName}/pulls/${this.props.pullRequestId}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('PR data received:', data);
      this.setState({
        pullRequest: data,
      });
    } catch (error) {
      console.error('Failed to fetch pull request data:', error);
    }
  }

  /**
   * componentDidMount - after component mount
   *
   * @return {void}
   **/
  componentDidMount() {
    this.getPullRequest();
  }

  /**
   * componentDidUpdate
   *
   * @param {object} prevProps
   * @return {void}
   */
  componentDidUpdate(prevProps) {
    if (
      prevProps.repository.fullName !== this.props.repository.fullName ||
      prevProps.pullRequestId !== this.props.pullRequestId
    ) {
      this.getPullRequest();
    }
  }

  /**
   * getTimeDeltaString - converts seconds to an output string
   *
   * @param {number} value - The value which helds the timedelta
   * @return {string} - The formatted output
   **/
  getTimeDeltaString(value) {
    console.log(value);
    const days = Math.floor(value / 86400);
    const daysRemainer = value % 86400;
    const hours = Math.floor(daysRemainer / 3600);
    const hoursRemainer = daysRemainer % 3600;
    const minutes = Math.floor(hoursRemainer / 60);
    return `${days} ${days === 1 ? 'day' : 'days'} ${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }

  /**
   * render - renders
   * @return {object} - The element to be renderd
   **/
  render() {
    if (!this.state.pullRequest) {
      return (
        <div>
          Here you can enable world driven for each of your repositories. When
          enabled, pull requests are watched and automatically merged based on
          the reviews.
        </div>
      );
    }

    const contributors = [];
    console.log(this.state.pullRequest.stats);
    for (const contributor of this.state.pullRequest.stats.contributors) {
      contributors.push(
        <tr
          key={contributor.name}
          className={styles[`review_value${contributor.reviewValue}`]}
        >
          <td>{contributor.name}</td>
          <td>{contributor.commits}</td>
          <td>{this.getTimeDeltaString(contributor.timeValue)}</td>
        </tr>
      );
    }

    const githubPullRequestLink = `https://github.com/${this.state.pullRequest.org}/${this.state.pullRequest.repo}/pull/${this.state.pullRequest.number}`;
    return (
      <div className={styles.content}>
        <h1>
          <a href={githubPullRequestLink}>
            {this.state.pullRequest.title}{' '}
            <span className={styles.pullRequestNumber}>
              #{this.state.pullRequest.number}
            </span>
          </a>
        </h1>
        <span className={styles.PullRequestSummary}>
          state: {this.state.pullRequest.state}
        </span>

        <details>
          <summary className={styles.PullRequestSummary}>
            <span title="The point in time when the countdown starts">
              Start date:{' '}
              {new Date(this.state.pullRequest.dates.max || 0).toISOString()}
            </span>
          </summary>
          <table>
            <tbody>
              <tr title="The last date it was pushed">
                <td>Push date:</td>
                <td>
                  {new Date(
                    this.state.pullRequest.dates.push || 0
                  ).toISOString()}
                </td>
              </tr>
              <tr title="The last date of the commits">
                <td>Commit date:</td>
                <td>
                  {new Date(
                    this.state.pullRequest.dates.commit || 0
                  ).toISOString()}
                </td>
              </tr>
              <tr title="The last date it was ready for Review">
                <td>Ready For Review date:</td>
                <td>
                  {new Date(
                    this.state.pullRequest.dates.lastDraft || 0
                  ).toISOString()}
                </td>
              </tr>
              <tr title="The date when the pull request was opened">
                <td>Pull Request date:</td>
                <td>
                  {new Date(
                    this.state.pullRequest.dates.created || 0
                  ).toISOString()}
                </td>
              </tr>
              <tr>
                <td>
                  <hr />
                </td>
                <td>
                  <hr />
                </td>
              </tr>
              <tr title="The start date is the most recent one from the above">
                <td>Start date:</td>
                <td>
                  {new Date(
                    this.state.pullRequest.dates.max || 0
                  ).toISOString()}
                </td>
              </tr>
            </tbody>
          </table>
        </details>

        <details>
          <summary className={styles.PullRequestSummary}>
            <span title="Pull Request reviews counted as votes">
              Positive votes: {this.state.pullRequest.stats.votes}/
              {this.state.pullRequest.stats.votesTotal} (~
              {Math.round(
                (this.state.pullRequest.stats.votes /
                  this.state.pullRequest.stats.votesTotal) *
                  100
              )}{' '}
              %)
            </span>
          </summary>
          <table>
            <tbody>
              <tr>
                <td title="Number of votes due to pull request reviews">
                  votes:
                </td>
                <td>{this.state.pullRequest.stats.votes}</td>
              </tr>
              <tr>
                <td title="The total number of votes (commits)">
                  votes total:
                </td>
                <td>{this.state.pullRequest.stats.votesTotal}</td>
              </tr>
              <tr>
                <td title="The factor by which the total merge days are reduced">
                  coefficient:
                </td>
                <td>{this.state.pullRequest.stats.coefficient}</td>
              </tr>
            </tbody>
          </table>
          <table>
            <tbody>
              <tr>
                <td>
                  <b>name</b>
                </td>
                <td>commits</td>
                <td>merge boost</td>
              </tr>
              {contributors}
            </tbody>
          </table>
        </details>

        <details>
          <summary className={styles.PullRequestSummary}>
            <span title="The Pull Request will be automatically merged in">
              Time to merge:{' '}
              {this.getTimeDeltaString(
                this.state.pullRequest.times.daysToMerge
              )}{' '}
              (
              {new Date(
                this.state.pullRequest.times.mergeDate * 1000 || 0
              ).toISOString()}
              )
            </span>
          </summary>
          <table>
            <tbody>
              <tr>
                <td title="For each commit the duration is extended by 5 days">
                  Commits:
                </td>
                <td>{this.state.pullRequest.stats.commits}</td>
              </tr>
              <tr>
                <td title="The total time until the Pull Request is merged. 5 days + commit days">
                  Total duration:
                </td>
                <td>
                  {this.getTimeDeltaString(
                    this.state.pullRequest.times.totalMergeTime
                  )}
                </td>
              </tr>
              <tr>
                <td title="Total merge days multiplied by the voting coefficient to get the actual duration.">
                  Reduce to:
                </td>
                <td>
                  {this.getTimeDeltaString(
                    this.state.pullRequest.times.mergeDuration
                  )}
                </td>
              </tr>
              <tr>
                <td title="How old is the pull request, based on max date">
                  Age:
                </td>
                <td>
                  {this.getTimeDeltaString(
                    this.state.pullRequest.stats.age / 1000
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </details>
      </div>
    );
  }
}

PullRequestView.propTypes = {
  // Used when fetching PR data (from Dashboard)
  repository: PropTypes.object,
  pullRequestId: PropTypes.number,
  // Used when PR data is already available (from PullRequest component)
  pullRequest: PropTypes.object,
};
