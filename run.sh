#!/usr/bin/env bash

git pull
. .env
pip install -r requirements.txt
python src/server.py
