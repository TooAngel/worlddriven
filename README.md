# Worlddriven Core

[![CI](https://github.com/TooAngel/worlddriven/actions/workflows/ci.yml/badge.svg)](https://github.com/TooAngel/worlddriven/actions/workflows/ci.yml)
[![Discord](https://img.shields.io/discord/496780499059572756?logo=discord&logoColor=white&label=Discord&color=7289da)](https://discord.gg/RrGFHKb)
[![Code Climate Maintainability](https://api.codeclimate.com/v1/badges/ec4136b6d2eeff72f192/maintainability)](https://codeclimate.com/github/TooAngel/worlddriven/maintainability)

The core application for the Worlddriven time-based auto-merge system. A Node.js/Express web service that:

- Processes GitHub webhooks for pull requests and reviews
- Calculates merge timelines based on contributor votes and activity
- Automatically merges pull requests when conditions are met
- Provides a React dashboard for repository management
- Supports both GitHub App and OAuth authentication

## How It Works

Pull requests are scheduled to merge after a base time period (default: 10 days). Contributors can speed up or delay merges through reviews:
- **Approve** reviews reduce merge time (weighted by contribution history)
- **Request changes** reviews increase merge time or block the merge
- Each repository can customize merge timing and method via `.worlddriven.ini`

Read more about the concept at [worlddriven.org](https://www.worlddriven.org)

## Default Configuration

- Base merge time: 240 hours (10 days)
- Per commit time: 0 hours
- Merge method: squash

## Repository Configuration

Repositories can customize merge settings by adding a `.worlddriven.ini` file to the default branch:

```ini
[DEFAULT]
baseMergeTimeInHours = 240
perCommitTimeInHours = 0
merge_method = squash
```

**Configuration Options:**
- `baseMergeTimeInHours`: Base time in hours before merging a PR (default: 240 = 10 days)
- `perCommitTimeInHours`: Extra time in hours per commit (default: 0)
- `merge_method`: GitHub merge method - `merge`, `squash`, or `rebase` (default: squash)

The application fetches this configuration from the repository's default branch when processing pull requests. Configuration is loaded from the default branch (not the PR branch) for security.

## Issue Labels

We use a comprehensive labeling system to organize issues and pull requests:

### Issue Types
- **bug** - Something isn't working correctly
- **enhancement** - New feature or improvement to existing functionality  
- **question** - Requires further information or discussion

### Issue Status
- **duplicate** - This issue or pull request already exists
- **invalid** - This doesn't seem right or is not actionable
- **wontfix** - We will not work on or change this
- **WIP** - Work in progress - do not merge yet

### Community
- **help wanted** - Community contributions welcome
- **good first issue** - Good for newcomers - straightforward task for first-time contributors
- **discussion** - Needs discussion or decision before implementation

### Technical Categories
- **dependencies** - Pull requests that update a dependency file
- **javascript** - JavaScript code changes or improvements
- **infrastructure** - Infrastructure, deployment, and DevOps tasks
- **security** - Security-related issues and vulnerabilities
- **modernization** - Modernizing code and dependencies
- **technical-debt** - Code cleanup and refactoring tasks
- **monitoring** - Monitoring, logging, and observability

## Setup

### Prerequisites

- Node.js (v18 or higher)
- MongoDB (default: `localhost:27017`)
- GitHub App or GitHub OAuth App credentials

### Run with docker compose

Copy `.env-example` to `.env` and add your environment variables.
```sh
docker compose up
```

### Manual Setup

1. **Install dependencies:**
   ```sh
   npm install
   ```

2. **Configure MongoDB:**

   The application uses MongoDB as the database. Set the connection URI:
   ```sh
   export MONGODB_URI=mongodb://localhost:27017/worlddriven
   ```

3. **Configure GitHub Authentication:**

   **Option A: GitHub App (Recommended)**
   - Create a GitHub App: https://docs.github.com/en/developers/apps/creating-a-github-app
   - Required permissions: Repository (Read & Write), Pull Requests (Read & Write), Checks (Read & Write)
   - Set environment variables:
     ```sh
     export GITHUB_APP_ID=your_app_id
     export GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
     export GITHUB_APP_NAME=your-app-name
     ```

   **Option B: GitHub OAuth App (Legacy)**
   - Create an OAuth App: https://docs.github.com/en/developers/apps/creating-an-oauth-app
   - Callback URL: `https://your-domain.com/github-callback`
   - Set environment variables:
     ```sh
     export GITHUB_CLIENT_ID=your_client_id
     export GITHUB_CLIENT_SECRET=your_client_secret
     ```

4. **Set session secret:**
   ```sh
   export SESSION_SECRET=your_random_secret_string
   ```

5. **Start the application:**

   Development mode:
   ```sh
   npm run dev
   ```

   Production mode:
   ```sh
   NODE_ENV=production npm start
   ```

## Testing

Run tests with:
```sh
npm test
```

Run only unit tests:
```sh
npm run test:unit
```

Run linter:
```sh
npm run lint
```

Format code:
```sh
npm run format
```

## Front end

The Front end has three views:

- `/` the front page
- `/dashboard` a dashboard with an overview of the repositories and a button to
enable World Driven for the repository
- `/:org/:repo/pull/:pull_number` A detailed calculation breakdown for the pull
request

Use the following endpoints to more easily work on the dashboard with mock data:

- `/test/dashboard` - for the dashboard
- `/test/:org/:repo/pull/:pull_number` - for the pull request view

## Development

### Frontend Development

The frontend uses React with Vite for development:

```sh
npm run dev
```

This starts both the Node.js server and Vite dev server with hot module replacement.

### Project Structure

- `src/` - Backend Node.js/Express application
  - `src/database/` - MongoDB models and database connection
  - `src/helpers/` - GitHub API integration, authentication, and business logic
  - `src/public/` - Frontend React application source
- `static/` - Static assets (images, HTML)
- `tests/` - Unit tests
- `dist/` - Built frontend (production only)

## Deployment

The application is a Node.js Express server that:
- Serves the React frontend (built with Vite)
- Provides REST API endpoints
- Handles GitHub webhooks
- Runs scheduled cron jobs for PR processing

**Environment variables required:**
- `MONGODB_URI` - MongoDB connection string
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_NAME` - GitHub App credentials
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` - OAuth credentials (legacy)
- `SESSION_SECRET` - Session encryption key
- `NODE_ENV` - Set to `production` for production builds
- `PORT` - Server port (default: 3000)
