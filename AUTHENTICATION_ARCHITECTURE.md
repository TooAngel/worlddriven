# Authentication Architecture

This document describes the clean auth system design for the world driven core application.

## Overview

The authentication system uses a 3-layer architecture that completely separates authentication concerns from business logic:

1. **Auth Layer** - Manages authentication methods and fallback strategies
2. **GitHub Client Layer** - Provides clean API abstraction with automatic auth fallback
3. **Business Logic Layer** - Pure data processing with zero authentication concerns

## Architecture Benefits

- **Separation of Concerns**: Authentication, API calls, and business logic are completely separate
- **Easy Testing**: Mock the GitHub Client for unit tests, no authentication mocking needed
- **Automatic Fallback**: Client tries each auth method until one works
- **Reusable**: Same Auth and GitHub Client can be used throughout the application
- **Extensible**: Easy to add new authentication methods
- **Clean**: Business logic has zero authentication concerns
- **Configurable**: Support for strict user auth vs. fallback modes

## Authentication Priority System

The system tries authentication methods in this priority order:

1. **Session User PAT** (Priority 1) - If user is logged in, use their personal access token
2. **Repository GitHub App** (Priority 2) - If repository is configured with GitHub App
3. **Repository Owner PAT** (Priority 3) - Fallback to repository owner's personal access token
4. **Environment Token** (Priority 4) - System-wide fallback using `GITHUB_FALLBACK_TOKEN`

## Configuration Options

### strict User Auth Flag

Controls fallback behavior when a user is logged in:

- `false` (default): Allow fallbacks for rate limits and reliability
- `true`: If user is logged in, only use their authentication (more privacy-focused)

### Usage Examples

```javascript
// Default mode - allows all fallbacks for reliability
const auth = new Auth({
  sessionId: req.session.userId,
  owner: 'user',
  repo: 'repo'
});

// Strict user mode - no fallbacks if user is logged in
const auth = new Auth({
  sessionId: req.session.userId,
  owner: 'user',
  repo: 'repo',
  strictUserAuth: true
});

// Public access only (no session)
const auth = new Auth({
  owner: 'user',
  repo: 'repo'
});
```

## File Structure

### `src/helpers/auth.js`
- `Auth` class that manages authentication methods
- Lazy-loads available authentication methods from database
- Configurable fallback behavior
- Self-contained with comprehensive documentation

### `src/helpers/github-client.js`
- `GitHubClient` class that uses Auth for all GitHub API calls
- Single `makeRequest()` method with automatic fallback
- Clean API methods: `getPullRequest()`, `getContributors()`, etc.
- No authentication logic in individual methods

### `src/helpers/pullRequest.js`
- Pure business logic functions
- Takes `GitHubClient` instead of user/auth parameters
- Same algorithms and calculations as before
- Zero authentication concerns

### Route Usage (`src/index.js`)
- Simple 4-line pattern:
  1. Create Auth with request context
  2. Create GitHub Client with Auth
  3. Call business logic with GitHub Client
  4. Return results

## Migration from Old Architecture

### Before (Mixed Concerns)
```javascript
// Authentication logic mixed everywhere
if (user._isGitHubApp) {
  const data = await user._octokit.request(...);
} else {
  const response = await fetch(url, {
    headers: { Authorization: `token ${user.githubAccessToken}` }
  });
}
```

### After (Clean Separation)
```javascript
// Business logic is pure
const data = await githubClient.getContributors(url);

// Authentication is handled transparently by GitHubClient
// which uses Auth to try methods in priority order
```

## Testing Strategy

### Unit Testing Business Logic
```javascript
// Mock the GitHubClient for clean unit tests
const mockClient = {
  getPullRequest: jest.fn(),
  getContributors: jest.fn(),
  getReviews: jest.fn()
};

const result = await getPullRequestData(mockClient, 'owner', 'repo', 123);
// Test pure business logic without any auth concerns
```

### Integration Testing Authentication
```javascript
// Test Auth class with different scenarios
const auth = new Auth({ sessionId: 'user123', owner: 'test', repo: 'repo' });
const methods = await auth.getAllMethods();
expect(methods).toHaveLength(expectedCount);
```

## Error Handling

The system provides robust error handling:

1. **Auth Method Failures**: Automatically tries next method in priority order
2. **Rate Limit Protection**: Falls back to different tokens when limits hit
3. **Detailed Logging**: Auth strategy logging for debugging issues
4. **Graceful Degradation**: System remains functional even if some auth methods fail

## Extending the System

### Adding New Authentication Methods

1. Add new method type to Auth class:
```javascript
// In Auth.getAllMethods()
if (someCondition) {
  this._methods.push({
    type: 'NEW_TYPE',
    config: newConfig,
    priority: 5,
    description: 'New auth method'
  });
}
```

2. Add handler to GitHub Client:
```javascript
// In GitHubClient.makeRequest()
case 'NEW_TYPE':
  return await this._fetchWithNewMethod(url, options, method.config);
```

### Using in Other Parts of Application

```javascript
// Any route or service can use this pattern
const auth = new Auth({ sessionId, owner, repo });
const githubClient = new GitHubClient(auth);

// Use clean API methods
const pulls = await githubClient.getPullRequests(owner, repo);
const comment = await githubClient.createIssueComment(owner, repo, number, body);
```

## Debugging

### Check Authentication Strategy
```javascript
const auth = new Auth({ sessionId, owner, repo });
console.log(await auth.getAuthStrategy());
// Outputs:
// Auth strategy (with fallbacks):
// 1. Session user PAT
// 2. Repository GitHub App
// 3. Environment fallback token
```

### Check Available Methods
```javascript
const auth = new Auth({ sessionId, owner, repo });
const hasAuth = await auth.hasValidAuth();
const methods = await auth.getAllMethods();
console.log('Auth available:', hasAuth, 'Methods:', methods.length);
```

This architecture provides a solid foundation for reliable, maintainable, and extensible authentication handling throughout the application.