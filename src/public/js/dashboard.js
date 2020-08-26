import React from 'react';
import {Repository} from './repository'; // eslint-disable-line no-unused-vars

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
  }


  /**
   * componentDidMount - after component mount
   *
   * @return {void}
   **/
  componentDidMount() {
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
        this.setState({
          user: result.name,
        });
      })
      .catch(() => {
      // TODO better show a message and delete cookie?
        window.location.replace('/');
      });

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
      repositories.push(<Repository key={repository.full_name} repository={repository} />);
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
        Here you can enable world driven for each of your repositories. When
        enabled pull requests are watched and automatically emerged based on the
        reviews.
        <div className="main-content">
          <h2>Repositories</h2>
          <div className="repositories">
            { repositories }
          </div>
        </div>
      </div>
    );
  }
}
