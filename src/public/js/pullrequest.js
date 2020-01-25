import React from 'react';

/**
 * Application class
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
    };
  }

  /**
   * componentDidMount - after component mount
   *
   * @return {void}
   **/
  componentDidMount() {
    const getPullRequest = new Request(`/v1${window.location.pathname}`, {
      method: 'GET',
    });
    fetch(getPullRequest)
      .then((res) => res.json())
      .then((result) => {
        this.setState({
          pullRequest: result.pull_request,
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
    const style = {
      height: '100%',
    };

    const headerStyle = {color: 'grey'};
    const statsStyle = {
      width: '50%',
      float: 'left',
    };
    const actionStyle = {
      width: '50%',
    };
    const contributorStyle = {
      width: '50%',
      float: 'left',
    };

    const contributors = [];
    for (const contributor of this.state.pullRequest.stats.contributors) {
      contributors.push(<tr key={contributor.name} className={`review_value${contributor.review_value}` }>
        <td>{ contributor.name }</td>
        <td>{ contributor.commits }</td>
        <td>{ this.getTimeDeltaString(contributor.time_value) }</td>
      </tr>);
    }

    return (
      <div style={style}>
        <h1>{ this.state.pullRequest.org }/{ this.state.pullRequest.repo } { this.state.pullRequest.title } <span style={headerStyle}>#{ this.state.pullRequest.number }</span></h1>
        <h2>Stats</h2>
        <table style={ statsStyle }>
          <tbody>
            <tr><td>commits:</td><td>{ this.state.pullRequest.stats.commits }</td></tr>
            <tr><td>votes:</td><td>{ this.state.pullRequest.stats.votes }</td></tr>
            <tr><td>votes_total:</td><td>{ this.state.pullRequest.stats.votes_total }</td></tr>
            <tr><td>coefficient:</td><td>{ this.state.pullRequest.stats.coefficient }</td></tr>
            <tr><td>age:</td><td>{this.getTimeDeltaString(this.state.pullRequest.stats.age.total_seconds)}</td></tr>
          </tbody>
        </table>
        <h2>Last action</h2>
        <table style={ actionStyle }>
          <tbody>
            <tr><td>unlabel_date:</td><td>{ new Date(this.state.pullRequest.dates.unlabel * 1000 || 0).toISOString() }</td></tr>
            <tr><td>push_date:</td><td>{ new Date(this.state.pullRequest.dates.push * 1000 || 0).toISOString() }</td></tr>
            <tr><td>commit_date:</td><td>{ new Date(this.state.pullRequest.dates.commit * 1000 || 0).toISOString() }</td></tr>
            <tr><td>pull_request_date:</td><td>{ new Date(this.state.pullRequest.dates.created * 1000 || 0).toISOString() }</td></tr>
            <tr><td><hr/></td><td><hr/></td></tr>
            <tr><td>max_date:</td><td>{ new Date(this.state.pullRequest.dates.max * 1000 || 0).toISOString() }</td></tr>
          </tbody>
        </table>

        <h2>Contributors</h2>
        <table style={ contributorStyle }>
          <tbody>
            <tr><td><b>name</b></td><td>commits</td><td>merge boost</td></tr>
            { contributors }
          </tbody>
        </table>

        <h2>Dates</h2>
        <table>
          <tbody>
            <tr><td>Total merge days</td><td>{ this.state.pullRequest.times.total_merge_time }</td></tr>
            <tr><td>Reduce dued to coefficient</td><td>{this.getTimeDeltaString(this.state.pullRequest.times.merge_duration.total_seconds)}</td></tr>
            <tr><td>Countdown</td><td>{this.getTimeDeltaString(this.state.pullRequest.times.days_to_merge.total_seconds)}</td></tr>
            <tr><td>Merge Date</td><td>{ new Date(this.state.pullRequest.times.merge_date * 1000 || 0).toISOString() }</td></tr>
          </tbody>
        </table>

      </div>
    );
  }
}
