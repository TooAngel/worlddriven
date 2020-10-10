import React from 'react';
import PropTypes from 'prop-types';

/**
 * Repository class
 **/
export class Repository extends React.Component { // eslint-disable-line no-unused-vars
  /**
   * contructor - The constructor
   *
   * @param {object} props - The properties
   * @return {void}
   **/
  constructor(props) {
    super(props);
    this.state = {};
    for (const pullRequest of this.props.repository.pull_requests) {
      this.state[pullRequest.title] = {fetched: false};
    }
    this.handleChange = this.handleChange.bind(this);
    this.selectPullRequest= this.selectPullRequest.bind(this);
  }

  /**
   * componentDidMount - after component mount
   *
   * @return {void}
   **/
  componentDidMount() {
    this.props.repository.pull_requests.forEach((pullRequest) => {
      this.props.getPullRequest(this.props.repository.full_name, pullRequest.number, (result) => {
        const pullRequestData = result.pull_request;
        pullRequestData.fetched = true;
        this.setState({[pullRequestData.title]: pullRequestData});
      });
    });
  }

  /**
   * selectPullRequest - selects a pull request
   *
   * @param {object} event - the click event
   * @param {string} pullRequestTitle - The title of a pull request
   * @return {void}
   **/
  selectPullRequest(event, pullRequestTitle) {
    this.props.setPullRequest(this.state[pullRequestTitle]);
  }

  /**
   * handleChange - handles changes
   *
   * @param {object} event - The event
   * @return {void}
   **/
  handleChange(event) {
    const updateRepository = new Request(`/v1/${event.target.name}/`, {
      method: 'PUT',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({'checked': event.target.checked}),
    });
    fetch(updateRepository);
  }

  /**
   * render - renders
   * @return {object} - The element to be renderd
   **/
  render() {
    const pullRequests = [];
    for (const pullRequest of Object.keys(this.state)) {
      const pullRequestData = this.state[pullRequest];
      if (!pullRequestData.fetched) {
        continue;
      }
      let className = 'pullRequestLine gray';
      let title = 'Not mergeable';
      let content = pullRequestData.title;
      if (pullRequestData.mergeable) {
        className = 'pullRequestLine red';
        title = 'Changes requested will not be merged';
        if (pullRequestData.stats.coefficient > 0) {
          className = 'pullRequestLine green';
          title = 'Will be merged automatically';
          content = <div className="pullRequestListItem">
            <div>
              <div>{pullRequestData.title}</div>
              <div>merge</div>
            </div>
            <div>{new Date(pullRequestData.times.merge_date * 1000 || 0).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}</div>
          </div>;
        }
      }
      pullRequests.push(<li key={pullRequestData.title} className={className} title={title} onClick={(e) => this.selectPullRequest(e, pullRequestData.title)}>{content}</li>);
    }
    const pullRequestsTag = <div className="repositoryList"><ul>{pullRequests}</ul></div>;

    return (<div key={this.props.repository.full_name} className="repository">
      <div className="repositoryName">{this.props.repository.full_name}</div>
      <div className="switcher">
        <label className="switch">
          <input type="checkbox" defaultChecked={this.props.repository.configured} name={this.props.repository.full_name} onClick={(e) => this.handleChange(e)}/>
          <span className="slider round"></span>
        </label>
      </div>
      {pullRequestsTag}
    </div>
    );
  }
}

Repository.propTypes = {
  repository: PropTypes.object,
  getPullRequest: PropTypes.func,
  setPullRequest: PropTypes.func,
};
