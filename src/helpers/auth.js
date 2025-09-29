/**
 * Authentication Management for GitHub API Access
 *
 * DESIGN PHILOSOPHY:
 * ==================
 *
 * This Auth class implements a priority-based authentication system that automatically
 * falls back through multiple authentication methods to ensure maximum reliability
 * and optimal rate limit usage.
 *
 * AUTHENTICATION PRIORITY ORDER:
 * 1. Session User PAT (if user is logged in) - Highest priority for personalized access
 * 2. Repository GitHub App (if configured) - App-level authentication for repositories
 * 3. Repository Owner PAT (if different from session user) - Fallback to repo owner's access
 * 4. Environment Token (GITHUB_FALLBACK_TOKEN) - System-wide fallback for unauthenticated access
 *
 * FALLBACK BEHAVIOR:
 * - strictUserAuth: false (default) - Always allow fallbacks for reliability/rate limits
 * - strictUserAuth: true - If user is logged in, only use their authentication
 *
 * WHY FALLBACKS MATTER:
 * - Rate limit protection: If user's PAT hits limits, fallback to app/environment token
 * - Reliability: If any auth method fails, others can still work
 * - User experience: Logged-in users get priority but system stays functional
 * - Public access: Environment token enables unauthenticated access with reasonable limits
 *
 * USAGE EXAMPLES:
 *
 * // Default - allows all fallbacks
 * const auth = new Auth({ sessionId: req.session.userId, owner: 'user', repo: 'repo' });
 *
 * // Strict user mode - no fallbacks if user is logged in
 * const auth = new Auth({
 *   sessionId: req.session.userId,
 *   owner: 'user',
 *   repo: 'repo',
 *   strictUserAuth: true
 * });
 *
 * // Public access only
 * const auth = new Auth({ owner: 'user', repo: 'repo' });
 */

import { User, Repository } from '../database/models.js';

export class Auth {
  constructor({ sessionId = null, owner, repo, strictUserAuth = false }) {
    this.sessionId = sessionId;
    this.owner = owner;
    this.repo = repo;
    this.strictUserAuth = strictUserAuth;
    this._methods = null; // Lazy loaded
  }

  /**
   * Get all available authentication methods in priority order
   * Lazy loads and caches the methods to avoid repeated database queries
   *
   * @returns {Array} Array of auth method objects sorted by priority
   */
  async getAllMethods() {
    if (this._methods) return this._methods;

    this._methods = [];

    // Priority 1: Session user's PAT (if logged in)
    if (this.sessionId) {
      try {
        const user = await User.findById(this.sessionId);
        if (user && user.githubAccessToken) {
          this._methods.push({
            type: 'PAT',
            user: user,
            priority: 1,
            description: 'Session user PAT',
          });

          // If strict user auth is enabled, stop here
          if (this.strictUserAuth) {
            return this._methods;
          }
        }
      } catch (error) {
        console.warn('Failed to load session user:', error.message);
      }
    }

    // Priority 2 & 3: Repository-based authentication
    try {
      const repository = await Repository.findByOwnerAndRepo(
        this.owner,
        this.repo
      );

      if (repository && repository.configured) {
        // Priority 2: GitHub App authentication
        if (repository.installationId) {
          this._methods.push({
            type: 'APP',
            installationId: repository.installationId,
            priority: 2,
            description: 'Repository GitHub App',
          });
        }

        // Priority 3: Repository owner's PAT (if different from session user)
        if (repository.userId && repository.userId !== this.sessionId) {
          try {
            const repoUser = await User.findById(repository.userId);
            if (repoUser && repoUser.githubAccessToken) {
              this._methods.push({
                type: 'PAT',
                user: repoUser,
                priority: 3,
                description: 'Repository owner PAT',
              });
            }
          } catch (error) {
            console.warn('Failed to load repository user:', error.message);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load repository config:', error.message);
    }

    // Priority 4: Environment token fallback (if available and not in strict mode)
    if (!this.strictUserAuth && process.env.GITHUB_FALLBACK_TOKEN) {
      this._methods.push({
        type: 'ENV',
        token: process.env.GITHUB_FALLBACK_TOKEN,
        priority: 4,
        description: 'Environment fallback token',
      });
    }

    // Sort by priority and return
    this._methods.sort((a, b) => a.priority - b.priority);
    return this._methods;
  }

  /**
   * Get a human-readable description of the authentication strategy
   * Useful for debugging and logging
   *
   * @returns {Promise<string>} Description of auth methods that will be tried
   */
  async getAuthStrategy() {
    const methods = await this.getAllMethods();
    if (methods.length === 0) {
      return 'No authentication methods available';
    }

    const descriptions = methods.map(m => `${m.priority}. ${m.description}`);
    const mode = this.strictUserAuth
      ? ' (strict user mode)'
      : ' (with fallbacks)';
    return `Auth strategy${mode}:\n${descriptions.join('\n')}`;
  }

  /**
   * Check if any authentication methods are available
   *
   * @returns {Promise<boolean>} True if at least one auth method is available
   */
  async hasValidAuth() {
    const methods = await this.getAllMethods();
    return methods.length > 0;
  }
}
