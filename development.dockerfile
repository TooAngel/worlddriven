FROM python:3

WORKDIR /usr/src/application/
RUN apt-get install libevent-dev
COPY . .
RUN pip install -r requirements.txt

CMD ["/bin/bash", "-c", "flask deploy-script && python main.py"]