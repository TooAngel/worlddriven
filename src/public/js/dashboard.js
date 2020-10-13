import React from 'react';
import {Repository} from './repository'; // eslint-disable-line no-unused-vars
import {PullRequestView} from './pullrequestView'; // eslint-disable-line no-unused-vars

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
   * @param {object} pullRequest - The Pull Request data
   * @return {void}
   **/
  setPullRequest(pullRequest) {
    this.setState({pullRequest: pullRequest});
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

    const repositories = [];
    for (const repository of this.state.repositories) {
      repositories.push(<Repository key={repository.full_name} repository={repository} getPullRequest={this.getPullRequest} setPullRequest={this.setPullRequest}/>);
    }

    let main = <div>Here you can enable world driven for each of your repositories. When
    enabled pull requests are watched and automatically merged based on the
    reviews.</div>;
    if (this.state.pullRequest) {
      main = <PullRequestView pullRequest={this.state.pullRequest} />;
    }

    return (
      <div style={style}>
        <div className="top">
          <div className="login">
            <a href="/logout">
              <span className="logintitle">Logout</span>
              <img src="/static/images/GitHub-Mark-120px-plus.png" width="30" />
            </a>
          </div>
        </div>
        <h1>{ this.state.user }</h1>
        <div className="main-content">
          <div className="gridFirst">
            <h2>Repositories</h2>
            <div className="repositories">
              {repositories}
            </div>
          </div>
          <div className="gridSecond">
            {main}
          </div>
        </div>
      </div>
    );
  }
}
