# GitHub App Migration Guide

This document outlines the migration from Personal Access Token (PAT) authentication to GitHub App authentication in World Driven.

## Overview

World Driven now supports both Personal Access Token (PAT) and GitHub App authentication methods. This hybrid approach allows for gradual migration while maintaining backward compatibility.

## Benefits of GitHub App Authentication

1. **Multi-owner resilience** - Survives individual user departures
2. **Better security** - Fine-grained permissions per repository
3. **Automatic token management** - No expired tokens to manage
4. **Organization support** - Works seamlessly with GitHub organizations
5. **Official GitHub recommendation** - Future-proof approach

## Architecture Changes

### Database Schema

The `repositories` collection now includes an `installationId` field:

```javascript
{
  _id: ObjectId(),
  owner: "TooAngel",
  repo: "screeps",
  userId: ObjectId() || null,        // Legacy PAT authentication
  installationId: 12345678 || null,  // GitHub App authentication
  configured: true,
  createdAt: Date,
  updatedAt: Date
}
```

### Authentication Flow

The system automatically detects the authentication method for each repository:

1. **GitHub App**: If `installationId` is present, uses GitHub App authentication
2. **PAT (Legacy)**: If `userId` is present, uses Personal Access Token authentication
3. **Error**: If neither is present, logs an error and skips the repository

### Hybrid API Functions

All GitHub API functions in `src/helpers/github.js` now accept either:
- A user object (for PAT authentication)
- An installation ID number (for GitHub App authentication)

Example:
```javascript
// PAT authentication
await getPullRequests(userObject, owner, repo);

// GitHub App authentication
await getPullRequests(installationId, owner, repo);
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

### For GitHub App (Recommended)

1. Visit `/install-app` to install the World Driven GitHub App
2. Select repositories to enable World Driven on
3. Repositories will be automatically configured with GitHub App authentication

### For PAT (Legacy)

1. Visit `/login` to authenticate with Personal Access Token
2. Use the dashboard to enable World Driven on repositories
3. Repositories will use PAT authentication

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
Using PAT authentication (user: 507f1f77bcf86cd799439011)
```

## Backward Compatibility

- Existing PAT-authenticated repositories continue to work unchanged
- OAuth login flow remains available at `/login`
- All existing API endpoints continue to function
- No breaking changes to existing functionality

## Future Migration

Once all repositories are migrated to GitHub App authentication:

1. The `userId` field can be removed from the database schema
2. PAT authentication code can be removed
3. OAuth login flow can be deprecated
4. The `users` collection can be removed

## Troubleshooting

### Repository Not Processing

Check the authentication method in logs:
- If "No authentication method configured", add either `installationId` or `userId`
- If "No user found", the referenced user doesn't exist in the database
- If "HTTP 401: Unauthorized", the token/installation has insufficient permissions

### GitHub App Installation Issues

1. Verify the app is installed on the repository owner's account
2. Check that the repository is included in the installation
3. Ensure web hook URL is correctly configured
4. Verify environment variables are set correctly

### Token Issues

- GitHub App tokens are automatically managed and refresh
- PAT tokens may expire and need manual renewal
- Check GitHub App permissions if operations fail

## Testing

Test both authentication methods:

1. Install GitHub App on a test repository
2. Verify web hook events are received and processed
3. Check that pull requests are processed correctly
4. Ensure existing PAT repositories continue working
5. Test migration from PAT to GitHub App authentication