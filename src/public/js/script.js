import React from 'react'; // eslint-disable-line no-unused-vars
import ReactDOM from 'react-dom';

import {Dashboard} from './dashboard'; // eslint-disable-line no-unused-vars
import {TestDashboard} from './test/dashboard'; // eslint-disable-line no-unused-vars
import {PullRequest} from './pullrequest'; // eslint-disable-line no-unused-vars
import {TestPullRequest} from './test/pullrequest'; // eslint-disable-line no-unused-vars
import {Logs} from './logs'; // eslint-disable-line no-unused-vars

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
  if (window.location.pathname === '/test/dashboard') {
    tag = <TestDashboard />;
  } else if (window.location.pathname.startsWith('/test/')) {
    tag = <TestPullRequest />;
  }
  if (window.location.pathname === '/admin') {
    tag = <Logs />;
  }
  ReactDOM.render(
    tag,
    document.getElementById('app'),
  );
}

main();
