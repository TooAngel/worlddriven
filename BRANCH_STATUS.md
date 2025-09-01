# Branch Status Documentation

## Branch Overview

### `python` (Original Python Implementation)
- **Last Commit**: `d1b6148 - Loosen the pinning`
- **Status**: Legacy Python/Flask application
- **Technology Stack**: 
  - Python/Flask server (`src/server.py`)
  - MongoDB database
  - SQLAlchemy models (`src/models.py`)
  - Python-based PR processing (`src/PullRequest.py`, `src/GithubReviews.py`)
  - Gunicorn/Docker setup
- **Dependencies**: Listed in `requirements.txt` (Flask, PyGithub, etc.)
- **Purpose**: Original working implementation, reference for functionality

### `javascript` (Node.js Migration - In Progress)
- **Last Commit**: `bd0b5b0 - Sort package.json`
- **Status**: Partially migrated Node.js implementation
- **Technology Stack**:
  - Express.js server (`src/index.js`)
  - MySQL/MariaDB with Sequelize ORM
  - Migrated GitHub API helpers (`src/helpers/github.js`, `src/helpers/pullRequest.js`)
  - React frontend components (updated)
  - Node-cron for scheduling
- **Issues**: 
  - Missing critical dependencies (express, sequelize, mysql2, got, node-cron)
  - Package.json version mismatches
  - Needs dependency cleanup
- **Purpose**: Migration attempt, contains working cron job logic

### `master` (Current Production Branch)
- **Last Commit**: `85de732 - Bump serve-static and express (#259)`
- **Status**: Most up-to-date Node.js implementation
- **Technology Stack**:
  - Complete Node.js/Express application
  - Updated dependencies (latest versions)
  - Modern React frontend with ES modules
  - MySQL/MariaDB setup
  - Proper webpack configuration
- **Differences from `javascript`**: 
  - Updated package dependencies
  - Refined frontend code
  - Better ES module imports
  - Updated configuration files
- **Purpose**: Current production-ready state

## Migration Status Summary

| Component | Python Branch | JavaScript Branch | Master Branch |
|-----------|--------------|-------------------|---------------|
| Server | ✅ Flask | ⚠️ Express (deps missing) | ✅ Express |
| Database | ✅ MongoDB | ⚠️ MySQL (partial) | ✅ MySQL |
| Cron Job | ✅ APScheduler | ✅ node-cron | ✅ node-cron |
| GitHub API | ✅ PyGithub | ✅ Custom (got) | ✅ Custom (got) |
| Frontend | ✅ Basic React | ⚠️ Updated React | ✅ Modern React |
| Dependencies | ✅ Python | ❌ Missing | ✅ Up-to-date |

## Recommendation

Use `master` as the base for cron job work since it has:
- Complete dependency management
- Latest security updates
- Proven Node.js implementation
- Clean ES module structure

Create a new `main` branch from `master` for the isolated cron job implementation.