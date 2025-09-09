import React from 'react';
import { Repository } from './repository.jsx'; // eslint-disable-line no-unused-vars
import { RepositoryListItem } from './repositoryListItem.jsx'; // eslint-disable-line no-unused-vars
import { PullRequestView } from './pullrequestView.jsx'; // eslint-disable-line no-unused-vars

import styles from '../../../static/css/dashboard.module.css';

/**
 * Dashboard class
 **/
export class Dashboard extends React.Component {
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
      user: '',
      repositories: [],
      fetched: false,
    };

    this.setPullRequest = this.setPullRequest.bind(this);
    this.setRepository = this.setRepository.bind(this);
    this.getUser = this.getUser.bind(this);
    this.getRepositories = this.getRepositories.bind(this);
  }

  /**
   * getUser - Fetches the user from the backend
   *
   * @return {void}
   **/
  async getUser() {
    const response = await fetch(`/v1/user/`);
    try {
      const data = await response.json();
      this.setState({
        user: data.name,
      });
    } catch (e) {
      console.error(e);
      location.href = '/';
    }
  }

  /**
   * getRepositories - Fetches the repositories from the backend
   *
   * @return {void}
   **/
  async getRepositories() {
    const response = await fetch(`/v1/repositories/`);
    const data = await response.json();
    this.setState({
      repositories: data.sort((a, b) =>
        a.configured === b.configured ? 0 : a.configured ? -1 : 1
      ),
      fetched: true,
    });
  }

  /**
   * getPullRequest - Fetches the Pull Request from the backend
   *
   * @param {string} repositoryFullName - The repository name
   * @param {integer} pullRequestNumber - The Pull Request number
   * @param {function} callback - The callback function
   * @return {void}
   **/
  getPullRequest(repositoryFullName, pullRequestNumber, callback) {
    const getPullRequest = new Request(
      `/v1/${repositoryFullName}/pull/${pullRequestNumber}/`,
      {
        method: 'GET',
      }
    );
    fetch(getPullRequest)
      .then(res => res.json())
      .then(result => {
        callback(result);
      })
      .catch(function (e) {
        console.log(`error: ${e}`);
      });
  }

  /**
   * componentDidMount - after component mount
   *
   * @return {void}
   **/
  componentDidMount() {
    this.getUser();
    this.getRepositories();
  }

  /**
   * setPullRequest - Sets the data of a pull request to the state
   *
   * @param {string} repositoryName - The index of the repository list
   * @param {string} pullRequestId - The Pull Request data
   * @return {void}
   **/
  setPullRequest(repositoryName, pullRequestId) {
    this.setState({
      activeRepository: repositoryName,
      pullRequestId: pullRequestId,
    });
  }

  /**
   * setRepository - Sets the data of a repository to the state
   *
   * @param {int} repositoryName - The index of the repository list
   * @return {void}
   **/
  setRepository(repositoryName) {
    this.setState({
      activeRepository: repositoryName,
      pullRequestId: undefined,
    });
  }

  /**
   * render - renders
   * @return {object} - The element to be renderd
   **/
  render() {
    if (!this.state.fetched) {
      return <div className="loader"></div>;
    }

    const repositories = [];
    for (const repository of this.state.repositories) {
      repositories.push(
        <RepositoryListItem
          key={repository.fullName}
          repository={repository}
          setRepository={this.setRepository}
          setPullRequest={this.setPullRequest}
        />
      );
    }
    console.log(this.state.activeRepository);
    const repository = (
      <Repository
        repository={this.state.repositories.find(
          repository => repository.fullName === this.state.activeRepository
        )}
      />
    );
    let pullRequest = <div />;
    if (this.state.pullRequestId) {
      pullRequest = (
        <PullRequestView
          repository={this.state.repositories.find(
            repository => repository.fullName === this.state.activeRepository
          )}
          pullRequestId={this.state.pullRequestId}
        />
      );
    }
    const main = (
      <div>
        {repository}
        {pullRequest}
      </div>
    );

    return (
      <div className={styles.content}>
        <div className="top">
          <div className="login">
            <a href="/logout">
              <span className="logintitle">Logout</span>
              <img src="/images/GitHub-Mark-120px-plus.png" width="30" />
            </a>
          </div>
        </div>
        <h1>{this.state.user}</h1>
        <div className={styles.mainContent}>
          <div className={styles.sidebar}>
            <h2 onClick={() => this.setRepository()}>Repositories</h2>
            <div>{repositories}</div>
          </div>
          {main}
        </div>
      </div>
    );
  }
}
