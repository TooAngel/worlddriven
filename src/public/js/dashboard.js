import React from 'react';
import {Repository} from './repository'; // eslint-disable-line no-unused-vars
import {RepositoryListItem} from './repositoryListItem'; // eslint-disable-line no-unused-vars
import {PullRequestView} from './pullrequestView'; // eslint-disable-line no-unused-vars

import styles from '../../../static/css/dashboard.module.css';

/**
 * Dashboard class
 **/
export class Dashboard extends React.Component { // eslint-disable-line no-unused-vars
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
  }

  /**
   * getUser - Fetches the user from the backend
   *
   * @param {function} callback - The callback function
   * @return {void}
   **/
  getUser(callback) {
    const getUser = new Request(`/v1/user/`, {
      method: 'GET',
    });
    fetch(getUser)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then((result) => {
        callback(result);
      })
      .catch(() => {
      // TODO better show a message and delete cookie?
        window.location.replace('/');
      });
  }

  /**
   * getRepositories - Fetches the repositories from the backend
   *
   * @param {function} callback - The callback function
   * @return {void}
   **/
  getRepositories(callback) {
    const getRepositories = new Request(`/v1/repositories/`, {
      method: 'GET',
    });
    fetch(getRepositories)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then((result) => {
        callback(result);
        this.setState({
          repositories: result.sort((a, b) => (a.configured === b.configured)? 0 : a.configured? -1 : 1),
          fetched: true,
        });
      })
      .catch((e) => {
      // TODO better show a message and delete cookie?
        console.log(e);
        window.location.replace('/');
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
    const getPullRequest = new Request(`/v1/${repositoryFullName}/pull/${pullRequestNumber}/`, {
      method: 'GET',
    });
    fetch(getPullRequest)
      .then((res) => res.json())
      .then((result) => {
        callback(result);
      }).catch(function(e) {
        console.log(`error: ${e}`);
      });
  }

  /**
   * componentDidMount - after component mount
   *
   * @return {void}
   **/
  componentDidMount() {
    this.getUser((result) => {
      this.setState({
        user: result.name,
      });
    });

    this.getRepositories((result) => {
      this.setState({
        repositories: result.sort((a, b) => (a.configured === b.configured)? 0 : a.configured? -1 : 1),
        fetched: true,
      });
    });
  }

  /**
   * setPullRequest - Sets the data of a pull request to the state
   *
   * @param {int} repositoryIndex - The index of the repository list
   * @param {object} pullRequest - The Pull Request data
   * @return {void}
   **/
  setPullRequest(repositoryIndex, pullRequest) {
    this.setState({activeRepository: repositoryIndex, pullRequest: pullRequest});
  }

  /**
   * setRepository - Sets the data of a repository to the state
   *
   * @param {int} repositoryIndex - The index of the repository list
   * @return {void}
   **/
  setRepository(repositoryIndex) {
    this.setState({activeRepository: repositoryIndex, pullRequest: undefined});
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
    for (let repositoryIndex=0; repositoryIndex < this.state.repositories.length; repositoryIndex++) {
      const repository = this.state.repositories[repositoryIndex];
      repositories.push(<RepositoryListItem key={repository.full_name} repositoryIndex={repositoryIndex} repository={repository} getPullRequest={this.getPullRequest} setRepository={this.setRepository} setPullRequest={this.setPullRequest}/>);
    }

    const repository = <Repository repository={this.state.repositories[this.state.activeRepository]} />;
    const pullRequest = <PullRequestView pullRequest={this.state.pullRequest} />;
    const main = <div>{repository}{pullRequest}</div>;

    return (
      <div className={styles.content}>
        <div className="top">
          <div className="login">
            <a href="/logout">
              <span className="logintitle">Logout</span>
              <img src="/static/images/GitHub-Mark-120px-plus.png" width="30" />
            </a>
          </div>
        </div>
        <h1>{ this.state.user }</h1>
        <div className={styles.mainContent}>
          <div className={styles.sidebar}>
            <h2 onClick={() => this.setRepository()}>Repositories</h2>
            <div>
              {repositories}
            </div>
          </div>
          {main}
        </div>
      </div>
    );
  }
}
