import React from 'react';

/**
 * Application class
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
    this.handleChange = this.handleChange.bind(this);
  }

  /**
   * componentDidMount - after component mount
   *
   * @return {void}
   **/
  componentDidMount() {
    const getUser = new Request(`/v1/user`, {
      method: 'GET',
    });
    fetch(getUser)
      .then((res) => res.json())
      .then((result) => {
        this.setState({
          user: result.name,
        });
      });

    const getRepositories = new Request(`/v1/repositories`, {
      method: 'GET',
    });
    fetch(getRepositories)
      .then((res) => res.json())
      .then((result) => {
        this.setState({
          repositories: result,
          fetched: true,
        });
      });
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
    if (!this.state.fetched) {
      return <div className="loader"></div>;
    }

    const style = {
      height: '100%',
    };

    const repositories = [];
    for (const repository of this.state.repositories) {
      repositories.push(
        <tr key={repository.full_name}>
          <td>{ repository.full_name }</td>
          <td>
            <label className="switch">
              <input type="checkbox" defaultChecked={repository.configured} name={ repository.full_name } onClick={(e) => this.handleChange(e)}/>
              <span className="slider round"></span>
            </label>
          </td>
        </tr>,
      );
    }

    return (
      <div style={style}>
        <h1>{ this.state.user }</h1>
        Here you can enable world driven for each of your repositories. When
        enabled pull requests are watched and automatically emerged based on the
        reviews.
        <div className="main-content">
          <h2>Repositories</h2>
          <table>
            <thead><tr><td><b>name</b></td></tr></thead>
            <tbody>{ repositories }</tbody>
          </table>
        </div>
      </div>
    );
  }
}
