import React from 'react'; // eslint-disable-line no-unused-vars
import ReactDOM from 'react-dom';

import {Application} from './application'; // eslint-disable-line no-unused-vars

/**
 * main - The main method
 *
 * @return {void}
 **/
function main() {
  ReactDOM.render(
    <Application />,
    document.getElementById('app'),
  );
}

main();
