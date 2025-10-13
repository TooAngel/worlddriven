# GitHub App Migration Guide

## Migration Status: ✅ COMPLETE

**Date Completed:** 2025-10-11

The migration from Personal Access Token (PAT) authentication to GitHub App authentication for repository operations is now complete.

## Overview

World Driven now uses GitHub App authentication exclusively for repository operations (PR management, webhooks, etc.). User OAuth authentication is still used for UI login and user-specific API calls.

## Benefits of GitHub App Authentication

1. **Multi-owner resilience** - Survives individual user departures
2. **Better security** - Fine-grained permissions per repository
3. **Automatic token management** - No expired tokens to manage
4. **Organization support** - Works seamlessly with GitHub organizations
5. **Official GitHub recommendation** - Future-proof approach

## Architecture Changes

### Database Schema

The `repositories` collection uses GitHub App authentication:

```javascript
{
  _id: ObjectId(),
  owner: "TooAngel",
  repo: "screeps",
  installationId: 12345678,  // Required: GitHub App installation ID
  configured: true,
  createdAt: Date,
  updatedAt: Date
}
```

**Note:** The `userId` field has been removed. User OAuth tokens are no longer used for repository operations.

### Authentication Flow

**Repository Operations (PR management, webhooks):**
1. **GitHub App** (Priority 1): Uses `installationId` from repository configuration
2. **Fallback Token** (Priority 2): Uses `GITHUB_FALLBACK_TOKEN` environment variable for public repositories
3. **Error**: If repository has no `installationId`, it cannot be processed

**User-Specific Operations (UI, user API calls):**
- Users log in via OAuth and their token is used for user-specific API endpoints like `/v1/repositories`
- This provides better rate limits for authenticated users

### API Architecture

**Repository Access:**
- New `Auth` class provides authentication strategy for repository operations
- `GitHubClient` class handles GitHub API requests with automatic auth fallback
- Uses GitHub App installation ID, never user tokens

**User-Specific Access:**
- Legacy hybrid functions in `src/helpers/github.js` accept user object OR installation ID
- User-authenticated routes (like `/v1/repositories/:owner/:repo`) use user tokens
- Provides better rate limits for logged-in users viewing their own repositories

Example:
```javascript
// Repository operations (PR processing, webhooks)
const auth = new Auth({ owner, repo });
const githubClient = new GitHubClient(auth);
await githubClient.getPullRequest(owner, repo, number);

// User-specific operations (user's repo list)
const repos = await fetch('https://api.github.com/user/repos', {
  headers: { Authorization: `token ${user.githubAccessToken}` }
});
```

## Environment Variables

Add these new environment variables for GitHub App support:

```bash
# GitHub App Configuration
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_APP_NAME=world-driven  # Optional, for installation URL

# Keep existing OAuth for backward compatibility
GITHUB_CLIENT_ID=existing_oauth_client_id
GITHUB_CLIENT_SECRET=existing_oauth_secret
```

## Installation and Usage

### Installing World Driven on Repositories

1. **Login:** Visit `/login` to authenticate with GitHub OAuth (for UI access)
2. **Install App:** Visit `/install-app` to install the World Driven GitHub App
3. **Select Repositories:** Choose which repositories to enable World Driven on
4. **Automatic Configuration:** Repositories will be automatically configured with GitHub App authentication

**Note:** User OAuth login is required to access the UI, but repository operations use the GitHub App, not user tokens.

## Migration Process

### Automatic Migration

When the GitHub App is installed on repositories that already exist in the database (from PAT setup), the system automatically:

1. Updates the repository record to include `installationId`
2. Keeps the existing `userId` for backward compatibility
3. Switches to GitHub App authentication for all operations

### Manual Migration

To migrate existing PAT repositories to GitHub App:

1. Install the GitHub App on your account/organization
2. Select the repositories you want to migrate
3. The web hook handlers will automatically update the database

### Database Migration

Run the migration script to add the `installationId` field to existing repositories:

```bash
node scripts/add-installation-field.js
```

## Web Hook Events

The GitHub App handles additional web hook events:

- `installation` - App installed/uninstalled
- `installation_repositories` - Repositories added/removed from installation
- `pull_request` - Pull request events (existing)
- `pull_request_review` - Review events (existing)
- `push` - Push events (existing)

## Monitoring

The application logs authentication method for each repository during processing:

```
Using GitHub App authentication (installation: 12345678)
```

If a repository has no GitHub App installed:
```
No GitHub App configured for owner/repo
```

## Migration Completed

**Changes Made:**

1. ✅ Removed `userId` field from repository schema
2. ✅ Removed PAT authentication for repository operations
3. ✅ All repository processing uses GitHub App only
4. ✅ OAuth login maintained for UI access and user-specific operations
5. ✅ Users collection preserved (needed for OAuth login)

**What's Kept:**

- OAuth login flow at `/login` (for UI access)
- User tokens for user-specific API calls (better rate limits)
- Users collection in database (for session management)
- Hybrid functions in `github.js` (for backward compatibility in user routes)

## Troubleshooting

### Repository Not Processing

Check the authentication method in logs:
- If "No GitHub App configured", install the GitHub App on the repository
- If "HTTP 401: Unauthorized", the GitHub App installation may have insufficient permissions or been uninstalled
- Verify the repository is included in the GitHub App installation

### GitHub App Installation Issues

1. Verify the app is installed on the repository owner's account
2. Check that the repository is included in the installation
3. Ensure web hook URL is correctly configured
4. Verify environment variables are set correctly

### Token Issues

- GitHub App tokens are automatically managed and refresh
- User OAuth tokens may expire (only affects UI login, not repository operations)
- Check GitHub App permissions if repository operations fail

## Testing

Test the complete flow:

1. **User Login:** Verify OAuth login flow at `/login` works
2. **App Installation:** Install GitHub App on a test repository
3. **Web Hooks:** Verify web hook events are received and processed
4. **PR Processing:** Check that pull requests are processed correctly with GitHub App authentication
5. **Public API:** Verify anonymous users can view PR data via fallback token
6. **User API:** Verify logged-in users can list their repositories with their OAuth token