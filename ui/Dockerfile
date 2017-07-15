FROM node:boron

MAINTAINER tooangel@tooangel.de

# Create app directory
RUN mkdir -p /srv/app
WORKDIR /srv/app
VOLUME /srv/app/node_modules

# Install Angular CLI
RUN yarn global add @angular/cli

# Install app dependencies
COPY package.json /srv/app/
RUN yarn install

# Bundle app source
COPY . /srv/app

EXPOSE 5000

ENTRYPOINT ["ng", "serve", "--host", "0.0.0.0", "--port", "5000"]
