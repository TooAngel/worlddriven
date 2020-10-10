import React from 'react';
import PropTypes from 'prop-types';

/**
 * PullRequest class
 **/
export class PullRequestView extends React.Component { // eslint-disable-line no-unused-vars
  /**
   * contructor - The constructor
   *
   * @param {object} props - The properties
   * @return {void}
   **/
  constructor(props) {
    super(props);
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
    const style = {
      height: '100%',
    };
    const headerStyle = {color: 'grey'};

    const contributors = [];
    for (const contributor of this.props.pullRequest.stats.contributors) {
      contributors.push(<tr key={contributor.name} className={`review_value${contributor.review_value}` }>
        <td>{ contributor.name }</td>
        <td>{ contributor.commits }</td>
        <td>{ this.getTimeDeltaString(contributor.time_value) }</td>
      </tr>);
    }

    const githubPullRequestLink = `https://github.com/${this.props.pullRequest.org}/${this.props.pullRequest.repo}/pull/${this.props.pullRequest.number}`;
    return (
      <div style={style}>
        <h1><a href={githubPullRequestLink}>{ this.props.pullRequest.title } <span style={headerStyle}>#{ this.props.pullRequest.number }</span></a></h1>
        <span className="PullRequestSummary">repository: { this.props.pullRequest.org }/{ this.props.pullRequest.repo }</span> <br />
        <span className="PullRequestSummary">state: { this.props.pullRequest.state }</span>

        <details>
          <summary className="PullRequestSummary"><span title="The point in time when the countdown starts">Start date: { new Date(this.props.pullRequest.dates.max * 1000 || 0).toISOString() }</span></summary>
          <table>
            <tbody>
              <tr title="The date when the labels changed"><td>Unlabel date:</td><td>{ new Date(this.props.pullRequest.dates.unlabel * 1000 || 0).toISOString() }</td></tr>
              <tr title="The last date it was pushed"><td>Push date:</td><td>{ new Date(this.props.pullRequest.dates.push * 1000 || 0).toISOString() }</td></tr>
              <tr title="The last date of the commits"><td>Commit date:</td><td>{ new Date(this.props.pullRequest.dates.commit * 1000 || 0).toISOString() }</td></tr>
              <tr title="The last date it was ready for Review"><td>Ready For Review date:</td><td>{ new Date(this.state.pullRequest.dates.last_draft * 1000 || 0).toISOString() }</td></tr>
              <tr title="The date when the pull request was opened"><td>Pull Request date:</td><td>{ new Date(this.props.pullRequest.dates.created * 1000 || 0).toISOString() }</td></tr>
              <tr><td><hr/></td><td><hr/></td></tr>
              <tr title="The start date is the most recent one from the above"><td>Start date:</td><td>{ new Date(this.props.pullRequest.dates.max * 1000 || 0).toISOString() }</td></tr>
            </tbody>
          </table>
        </details>

        <details>
          <summary className="PullRequestSummary"><span title="Pull Request reviews counted as votes">Positive votes: { this.props.pullRequest.stats.votes }/{ this.props.pullRequest.stats.votes_total } (~{ Math.round(this.props.pullRequest.stats.votes / this.props.pullRequest.stats.votes_total * 100) } %)</span></summary>
          <table>
            <tbody>
              <tr><td title="Number of votes due to pull request reviews">votes:</td><td>{ this.props.pullRequest.stats.votes }</td></tr>
              <tr><td title="The total number of votes (commits)">votes_total:</td><td>{ this.props.pullRequest.stats.votes_total }</td></tr>
              <tr><td title="The factor by which the total merge days are reduced">coefficient:</td><td>{ this.props.pullRequest.stats.coefficient }</td></tr>
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
            <span title="The Pull Request will be automatically merged in">Time to merge: {this.getTimeDeltaString(this.props.pullRequest.times.days_to_merge.total_seconds)} ({ new Date(this.props.pullRequest.times.merge_date * 1000 || 0).toISOString() })</span>
          </summary>
          <table>
            <tbody>
              <tr><td title="For each commit the duration is extended by 5 days">Commits:</td><td>{ this.props.pullRequest.stats.commits }</td></tr>
              <tr><td title="The total time until the Pull Request is merged. 5 days + commit days">Total duration:</td><td>{ this.props.pullRequest.times.total_merge_time }</td></tr>
              <tr><td title="Total merge days multiplied by the voting coefficient to get the actual duration.">Reduce to:</td><td>{this.getTimeDeltaString(this.props.pullRequest.times.merge_duration.total_seconds)}</td></tr>
              <tr><td title="How old is the pull request, based on max date">Age:</td><td>{this.getTimeDeltaString(this.props.pullRequest.stats.age.total_seconds)}</td></tr>
            </tbody>
          </table>
        </details>

      </div>
    );
  }
}

PullRequestView.propTypes = {
  pullRequest: PropTypes.object.isRequired,
};
