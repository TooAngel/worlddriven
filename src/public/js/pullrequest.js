import React from 'react';

import {PullRequestView} from './pullrequestView.js'; // eslint-disable-line no-unused-vars

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
   * render - renders
   * @return {object} - The element to be renderd
   **/
  render() {
    if (!this.state.fetched) {
      return <div className="loader"></div>;
    }
    return <PullRequestView pullRequest={this.state.pullRequest} />;
  }
}
