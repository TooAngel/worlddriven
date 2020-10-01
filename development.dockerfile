FROM python:3

WORKDIR /usr/src/application/
RUN apt-get install libevent-dev
COPY . .
RUN pip install -r requirements.txt
