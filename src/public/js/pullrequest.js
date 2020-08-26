import React from 'react';

/**
 * PullRequest class
 **/
export class PullRequest extends React.Component { // eslint-disable-line no-unused-vars
  /**
   * contructor - The constructor
   *
   * @param {object} props - The properties
   * @return {void}
   **/
  constructor(props) {
    super(props);
    this.state = {
      pullRequest: {
        stats: {
          age: {},
          contributors: [],
        },
        dates: {},
        times: {
          merge_duration: {},
          days_to_merge: {},
        },
      },
      fetched: false,
    };
  }

  /**
   * componentDidMount - after component mount
   *
   * @return {void}
   **/
  componentDidMount() {
    const getPullRequest = new Request(`/v1${window.location.pathname}/`, {
      method: 'GET',
    });
    fetch(getPullRequest)
      .then((res) => res.json())
      .then((result) => {
        this.setState({
          pullRequest: result.pull_request,
          fetched: true,
        });
      });
  }

  /**
   * getTimeDeltaString - converts seconds to an output string
   *
   * @param {number} value - The value which helds the timedelta
   * @return {string} - The formatted output
   **/
  getTimeDeltaString(value) {
    const days = Math.floor(value / 86400);
    const daysRemainer = value % 86400;
    const hours = Math.floor(daysRemainer / 3600);
    const hoursRemainer = daysRemainer % 3600;
    const minutes = Math.floor(hoursRemainer / 60);
    return `${days} ${days === 1 ? 'day' : 'days'} ${hours} ${hours === 1 ? 'hour': 'hours'} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }

  /**
   * render - renders
   * @return {object} - The element to be renderd
   **/
  render() {
    if (!this.state.fetched) {
      return <div className="loader"></div>;
    }
    const style = {
      height: '100%',
    };

    const headerStyle = {color: 'grey'};

    const contributors = [];
    for (const contributor of this.state.pullRequest.stats.contributors) {
      contributors.push(<tr key={contributor.name} className={`review_value${contributor.review_value}` }>
        <td>{ contributor.name }</td>
        <td>{ contributor.commits }</td>
        <td>{ this.getTimeDeltaString(contributor.time_value) }</td>
      </tr>);
    }

    const githubPullRequestLink = `https://github.com/${this.state.pullRequest.org}/${this.state.pullRequest.repo}/pull/${this.state.pullRequest.number}`;

    return (
      <div style={style}>
        <h1><a href={githubPullRequestLink}>{ this.state.pullRequest.title } <span style={headerStyle}>#{ this.state.pullRequest.number }</span></a></h1>
        <span className="PullRequestSummary">repository: { this.state.pullRequest.org }/{ this.state.pullRequest.repo }</span> <br />
        <span className="PullRequestSummary">state: { this.state.pullRequest.state }</span>

        <details>
          <summary className="PullRequestSummary"><span title="The point in time when the countdown starts">Start date: { new Date(this.state.pullRequest.dates.max * 1000 || 0).toISOString() }</span></summary>
          <table>
            <tbody>
              <tr title="The date when the labels changed"><td>Unlabel date:</td><td>{ new Date(this.state.pullRequest.dates.unlabel * 1000 || 0).toISOString() }</td></tr>
              <tr title="The last date it was pushed"><td>Push date:</td><td>{ new Date(this.state.pullRequest.dates.push * 1000 || 0).toISOString() }</td></tr>
              <tr title="The last date of the commits"><td>Commit date:</td><td>{ new Date(this.state.pullRequest.dates.commit * 1000 || 0).toISOString() }</td></tr>
              <tr title="The date when the pull request was opened"><td>Pull Request date:</td><td>{ new Date(this.state.pullRequest.dates.created * 1000 || 0).toISOString() }</td></tr>
              <tr><td><hr/></td><td><hr/></td></tr>
              <tr title="The start date is the most recent one from the above"><td>Start date:</td><td>{ new Date(this.state.pullRequest.dates.max * 1000 || 0).toISOString() }</td></tr>
            </tbody>
          </table>
        </details>

        <details>
          <summary className="PullRequestSummary"><span title="Pull Request reviews counted as votes">Positive votes: { this.state.pullRequest.stats.votes }/{ this.state.pullRequest.stats.votes_total }</span></summary>
          <table>
            <tbody>
              <tr><td title="Number of votes due to pull request reviews">votes:</td><td>{ this.state.pullRequest.stats.votes }</td></tr>
              <tr><td title="The total number of votes (commits)">votes_total:</td><td>{ this.state.pullRequest.stats.votes_total }</td></tr>
              <tr><td title="The factor by which the total merge days are reduced">coefficient:</td><td>{ this.state.pullRequest.stats.coefficient }</td></tr>
            </tbody>
          </table>
          <table>
            <tbody>
              <tr><td><b>name</b></td><td>commits</td><td>merge boost</td></tr>
              { contributors }
            </tbody>
          </table>
        </details>

        <details>
          <summary className="PullRequestSummary">
            <span title="The Pull Request will be automatically merged in">Time to merge: {this.getTimeDeltaString(this.state.pullRequest.times.days_to_merge.total_seconds)} ({ new Date(this.state.pullRequest.times.merge_date * 1000 || 0).toISOString() })</span>
          </summary>
          <table>
            <tbody>
              <tr><td title="For each commit the duration is extended by 5 days">Commits:</td><td>{ this.state.pullRequest.stats.commits }</td></tr>
              <tr><td title="The total time until the Pull Request is merged. 5 days + commit days">Total duration:</td><td>{ this.state.pullRequest.times.total_merge_time }</td></tr>
              <tr><td title="Total merge days multiplied by the voting coefficient to get the actual duration.">Reduce to:</td><td>{this.getTimeDeltaString(this.state.pullRequest.times.merge_duration.total_seconds)}</td></tr>
              <tr><td title="How old is the pull request, based on max date">Age:</td><td>{this.getTimeDeltaString(this.state.pullRequest.stats.age.total_seconds)}</td></tr>
            </tbody>
          </table>
        </details>

      </div>
    );
  }
}
