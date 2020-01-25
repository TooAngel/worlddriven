import React from 'react'; // eslint-disable-line no-unused-vars
import ReactDOM from 'react-dom';

import {Dashboard} from './dashboard'; // eslint-disable-line no-unused-vars
import {PullRequest} from './pullrequest'; // eslint-disable-line no-unused-vars

/**
 * main - The main method
 *
 * @return {void}
 **/
function main() {
  let tag = <PullRequest />;
  if (window.location.pathname === '/dashboard') {
    tag = <Dashboard />;
  }
  ReactDOM.render(
    tag,
    document.getElementById('app'),
  );
}

main();
