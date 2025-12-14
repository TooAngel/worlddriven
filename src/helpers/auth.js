/**
 * Authentication Management for GitHub API Access
 *
 * DESIGN PHILOSOPHY:
 * ==================
 *
 * This Auth class implements GitHub App authentication with an environment token
 * fallback for maximum reliability and rate limit protection.
 *
 * AUTHENTICATION PRIORITY ORDER:
 * 1. Repository GitHub App (if configured) - Primary authentication method
 * 2. Environment Token (GITHUB_FALLBACK_TOKEN) - System-wide fallback for unauthenticated access
 *
 * FALLBACK BEHAVIOR:
 * - If GitHub App authentication fails, falls back to environment token
 * - Environment token provides basic access with reasonable rate limits
 *
 * WHY FALLBACKS MATTER:
 * - Rate limit protection: If app hits limits, fallback to environment token
 * - Reliability: If any auth method fails, others can still work
 * - Public access: Environment token enables unauthenticated access with reasonable limits
 *
 * USAGE EXAMPLES:
 *
 * // Standard usage
 * const auth = new Auth({ owner: 'user', repo: 'repo' });
 * const methods = await auth.getAllMethods();
 */

import { Repository } from '../database/models.js';

export class Auth {
  constructor({ owner, repo }) {
    this.owner = owner;
    this.repo = repo;
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

    // Priority 1: Repository GitHub App authentication
    try {
      const repository = await Repository.findByOwnerAndRepo(
        this.owner,
        this.repo
      );

      if (repository && repository.installationId) {
        this._methods.push({
          type: 'APP',
          installationId: repository.installationId,
          priority: 1,
          description: 'Repository GitHub App',
        });
      }
    } catch (error) {
      console.warn('Failed to load repository config:', error.message);
    }

    // Priority 2: Environment token (if available)
    if (process.env.WORLDDRIVEN_GITHUB_TOKEN) {
      this._methods.push({
        type: 'ENV',
        token: process.env.WORLDDRIVEN_GITHUB_TOKEN,
        priority: 2,
        description: 'Worlddriven GitHub token',
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
    return `Auth strategy (with fallbacks):\n${descriptions.join('\n')}`;
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
