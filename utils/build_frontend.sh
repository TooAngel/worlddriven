#!/bin/bash

npm install
node_modules/.bin/nodemon --exec "npm run build || exit 1"
