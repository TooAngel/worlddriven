#!/usr/bin/env bash

git pull
. .env
cd ui
yarn
node_modules/.bin/ng build
cd ..
pip install -r requirements.txt
python src/server.py
