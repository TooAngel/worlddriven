MAINTAINER tooangel@tooangel.de
FROM python:3

RUN mkdir /srv/www
WORKDIR /srv/www

COPY requirements.txt /srv/www/
RUN pip install -r requirements.txt

COPY src/server.py /srv/www/server.py

ENTRYPOINT ["python", "server.py"]
