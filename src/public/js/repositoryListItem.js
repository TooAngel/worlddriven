import React from 'react';
import PropTypes from 'prop-types';
import styles from '../../../static/css/repositoryListItem.module.css';

/**
 * RepositoryListItem class
 **/
export class RepositoryListItem extends React.Component { // eslint-disable-line no-unused-vars
  /**
   * contructor - The constructor
   *
   * @param {object} props - The properties
   * @return {void}
   **/
  constructor(props) {
    super(props);
    this.state = {
      pullRequests: [],
    };
    this.handleChange = this.handleChange.bind(this);
    this.selectPullRequest= this.selectPullRequest.bind(this);
  }

  /**
   * getPullRequests
   */
  async getPullRequests() {
    const response = await fetch(`/v1/repositories/${this.props.repository.fullName}/pulls`);
    const data = await response.json();
    this.setState({
      pullRequests: data,
    });
  }

  /**
   * componentDidMount - after component mount
   *
   * @return {void}
   **/
  componentDidMount() {
    this.getPullRequests();
  }

  /**
   * selectPullRequest - selects a pull request
   *
   * @param {string} pullRequestNumber - The number of a pull request
   * @return {void}
   **/
  selectPullRequest(pullRequestNumber) {
    this.props.setPullRequest(this.props.repository.fullName, pullRequestNumber);
  }

  /**
   * handleChange - handles changes
   *
   * @param {object} event - The event
   * @return {void}
   **/
  handleChange(event) {
    const updateRepository = new Request(`/v1/repositories/${event.target.name}/`, {
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
    for (const pullRequest of this.state.pullRequests) {
      pullRequests.push(<li key={pullRequest.title} onClick={() => this.selectPullRequest(pullRequest.number)}>{pullRequest.title}</li>);
    }
    const pullRequestsTag = <div className={styles.repositoryList}><ul>{pullRequests}</ul></div>;

    return (<div key={this.props.repository.fullName} className={styles.repository}>
      <div className={styles.repositoryName} onClick={() => this.props.setRepository(this.props.repository.fullName)}>{this.props.repository.fullName}</div>
      <div>
        <label className={styles.switch}>
          <input type="checkbox" defaultChecked={this.props.repository.configured} name={this.props.repository.fullName} onClick={(e) => this.handleChange(e)}/>
          <span className={styles.slider + ' ' + styles.round}></span>
        </label>
      </div>
      {pullRequestsTag}
    </div>
    );
  }
}

RepositoryListItem.propTypes = {
  repository: PropTypes.object,
  getPullRequest: PropTypes.func,
  setRepository: PropTypes.func,
  setPullRequest: PropTypes.func,
  repositoryIndex: PropTypes.number,
};
