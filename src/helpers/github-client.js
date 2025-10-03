/**
 * GitHub API Client with Automatic Authentication Fallback
 *
 * This client provides a clean abstraction over GitHub API calls with automatic
 * authentication fallback. It uses the Auth class to try multiple authentication
 * methods in priority order until one succeeds.
 *
 * KEY FEATURES:
 * - Automatic fallback through available authentication methods
 * - Clean API methods with no authentication concerns
 * - Supports both PAT and GitHub App authentication transparently
 * - Error handling with detailed logging
 * - Retry logic for transient failures
 *
 * USAGE:
 * const auth = new Auth({ sessionId, owner, repo });
 * const client = new GitHubClient(auth);
 * const data = await client.getPullRequest(owner, repo, number);
 */

import { getInstallationOctokit } from './githubApp.js';

export class GitHubClient {
  constructor(auth) {
    this.auth = auth;
    this._authMethods = null; // Cached auth methods
  }

  /**
   * Make a GitHub API request with automatic authentication fallback
   *
   * @param {string} url - GitHub API URL (can be full URL or path)
   * @param {object} options - Fetch options (method, body, etc.)
   * @param {object} octokitOptions - For GitHub App requests (owner, repo, etc.)
   * @returns {Promise<any>} Response data
   */
  async makeRequest(url, options = {}, octokitOptions = null) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);

    if (!this._authMethods) {
      this._authMethods = await this.auth.getAllMethods();
    }

    // Log the authentication strategy being attempted
    console.log(
      `[AUTH-${requestId}] Starting request to ${url || 'GitHub API'} with ${this._authMethods.length} auth method(s) available`
    );
    console.log(
      `[AUTH-${requestId}] Available methods: ${this._authMethods.map(m => `${m.priority}.${m.description}`).join(', ')}`
    );

    if (this._authMethods.length === 0) {
      console.error(
        `[AUTH-${requestId}] ❌ No authentication methods available`
      );
      throw new Error('No authentication methods available');
    }

    let lastError;
    let attemptCount = 0;

    for (const method of this._authMethods) {
      attemptCount++;
      const attemptStartTime = Date.now();

      try {
        console.log(
          `[AUTH-${requestId}] 🔑 Attempt ${attemptCount}: Using ${method.description} (priority ${method.priority})`
        );

        let result;
        switch (method.type) {
          case 'PAT':
          case 'ENV':
            result = await this._fetchWithToken(
              url,
              options,
              method.user?.githubAccessToken || method.token
            );
            break;

          case 'APP':
            if (octokitOptions) {
              result = await this._fetchWithApp(
                octokitOptions,
                method.installationId
              );
            } else {
              result = await this._fetchWithAppUrl(
                url,
                options,
                method.installationId
              );
            }
            break;

          default:
            throw new Error(`Unknown auth method: ${method.type}`);
        }

        // Success! Log the successful authentication
        const duration = Date.now() - startTime;
        const attemptDuration = Date.now() - attemptStartTime;
        console.log(
          `[AUTH-${requestId}] ✅ SUCCESS: ${method.description} worked after ${attemptCount} attempt(s) in ${duration}ms (attempt: ${attemptDuration}ms)`
        );
        console.log(
          `[AUTH-${requestId}] Auth type: ${method.type}, Priority: ${method.priority}, Total attempts: ${attemptCount}/${this._authMethods.length}`
        );

        return result;
      } catch (error) {
        const attemptDuration = Date.now() - attemptStartTime;
        console.warn(
          `[AUTH-${requestId}] ⚠️  ${method.description} failed in ${attemptDuration}ms:`,
          error.message
        );
        lastError = error;

        // If it's a rate limit error, definitely try next method
        if (error.status === 403 && error.message.includes('rate limit')) {
          console.log(
            `[AUTH-${requestId}] 🚫 Rate limit hit with ${method.description}, trying next auth method...`
          );
          continue;
        }

        // Authentication-related errors should trigger fallback
        if (error.status === 401 || error.status === 403) {
          console.log(
            `[AUTH-${requestId}] 🔐 Authentication error with ${method.description}, trying next auth method...`
          );
          continue;
        }

        // Business logic errors (like 405 Method Not Allowed) should not trigger auth fallback
        if (
          error.status === 405 ||
          error.status === 409 ||
          error.status === 422
        ) {
          console.log(
            `[AUTH-${requestId}] 🚫 Business logic error (${error.status}), not trying other auth methods`
          );
          throw error;
        }

        // For other 4xx errors, still try next method
        if (error.status >= 400 && error.status < 500) {
          console.log(
            `[AUTH-${requestId}] ⚠️  Client error (${error.status}) with ${method.description}, trying next auth method...`
          );
          continue;
        }

        // For server errors, maybe worth retrying with same method once
        if (error.status >= 500) {
          console.log(
            `[AUTH-${requestId}] 💥 Server error (${error.status}) with ${method.description}, trying next auth method...`
          );
          continue;
        }
      }
    }

    // All methods failed
    const duration = Date.now() - startTime;
    console.error(
      `[AUTH-${requestId}] ❌ FAILURE: All ${this._authMethods.length} authentication method(s) failed after ${duration}ms`
    );
    console.error(
      `[AUTH-${requestId}] Methods tried: ${this._authMethods.map(m => m.description).join(', ')}`
    );
    console.error(
      `[AUTH-${requestId}] Last error: ${lastError?.message || 'Unknown error'}`
    );

    throw new Error(
      `All authentication methods failed. Last error: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Make request using Personal Access Token
   */
  async _fetchWithToken(url, options, token) {
    if (!url.startsWith('http')) {
      url = `https://api.github.com${url}`;
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = new Error(
        `HTTP ${response.status}: ${response.statusText}`
      );
      error.status = response.status;
      throw error;
    }

    return await response.json();
  }

  /**
   * Make request using GitHub App (with Octokit method)
   */
  async _fetchWithApp(octokitOptions, installationId) {
    const octokit = await getInstallationOctokit(installationId);
    const { data } = await octokit.rest.pulls.get(octokitOptions);
    return data;
  }

  /**
   * Make request using GitHub App (with URL)
   */
  async _fetchWithAppUrl(url, options, installationId) {
    const octokit = await getInstallationOctokit(installationId);

    if (!url.startsWith('http')) {
      url = `https://api.github.com${url}`;
    }

    const apiPath = url.replace('https://api.github.com', '');
    const { data } = await octokit.request(
      `${options.method || 'GET'} ${apiPath}`,
      options.body
    );
    return data;
  }

  // ============================================================================
  // CLEAN API METHODS - No authentication logic, just business logic
  // ============================================================================

  /**
   * Get pull request data
   */
  async getPullRequest(owner, repo, number) {
    return await this.makeRequest(null, null, {
      owner,
      repo,
      pull_number: parseInt(number),
    });
  }

  /**
   * Get contributors for a repository
   */
  async getContributors(contributorsUrl) {
    const data = await this.makeRequest(contributorsUrl);

    return data.map(contributor => ({
      name: contributor.login,
      commits: contributor.contributions,
      reviewValue: 0,
      timeValue: '',
    }));
  }

  /**
   * Get commits for a pull request
   */
  async getCommits(commitsUrl) {
    return await this.makeRequest(commitsUrl);
  }

  /**
   * Get reviews for a pull request
   */
  async getReviews(reviewsUrl) {
    return await this.makeRequest(reviewsUrl);
  }

  /**
   * Get issue events for a pull request
   */
  async getPullIssueEvents(issueUrl) {
    const eventsUrl = `${issueUrl}/events`;
    return await this.makeRequest(eventsUrl);
  }

  /**
   * Get repository events
   */
  async getBranchEvents(eventsUrl) {
    return await this.makeRequest(eventsUrl);
  }

  /**
   * Get repository pull requests
   */
  async getPullRequests(owner, repo, state = 'open') {
    const url = `/repos/${owner}/${repo}/pulls?state=${state}`;
    const data = await this.makeRequest(url);

    return data.map(pull => ({
      id: pull.id,
      title: pull.title,
      number: pull.number,
    }));
  }

  /**
   * Create an issue comment
   */
  async createIssueComment(owner, repo, number, body) {
    const url = `/repos/${owner}/${repo}/issues/${number}/comments`;
    return await this.makeRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body }),
    });
  }

  /**
   * Merge a pull request
   */
  async mergePullRequest(owner, repo, number, options = {}) {
    const url = `/repos/${owner}/${repo}/pulls/${number}/merge`;

    try {
      return await this.makeRequest(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });
    } catch (error) {
      // Handle the common "cannot merge" case gracefully
      if (error.status === 405) {
        return null; // Cannot merge (conflicts, checks failing, etc.)
      }
      throw error;
    }
  }

  /**
   * Get authentication strategy info (for debugging)
   */
  async getAuthInfo() {
    return await this.auth.getAuthStrategy();
  }
}
