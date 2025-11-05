/**
 * Configuration file parsing and fetching
 *
 * Handles reading and parsing .worlddriven.ini files from repositories
 * to allow per-repository configuration of merge timing and methods.
 */

/**
 * Parse INI file content
 * Supports simple INI format with [DEFAULT] section
 *
 * @param {string} content - INI file content
 * @returns {object} Parsed configuration object
 */
export function parseIniFile(content) {
  const config = {};
  let currentSection = 'DEFAULT';

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }

    // Section header
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1).trim();
      config[currentSection] = config[currentSection] || {};
      continue;
    }

    // Key-value pair
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex !== -1) {
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();

      config[currentSection] = config[currentSection] || {};
      config[currentSection][key] = value;
    }
  }

  return config;
}

/**
 * Fetch and parse .worlddriven.ini from a repository's default branch
 *
 * @param {GitHubClient} githubClient - Authenticated GitHub client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<object>} Configuration object with defaults
 */
export async function fetchRepositoryConfig(githubClient, owner, repo) {
  const defaultConfig = {
    baseMergeTimeInHours: 240,
    baseCloseTimeInHours: 2400,
    perCommitTimeInHours: 0,
    merge_method: 'squash',
  };

  try {
    // First, fetch repository details to get the default branch
    const repoData = await githubClient.getRepository(owner, repo);
    const defaultBranch = repoData.default_branch;

    // Construct the URL for the .worlddriven.ini file from the default branch
    const path = '.worlddriven.ini';
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(defaultBranch)}`;

    // Fetch the file content
    const response = await githubClient.fetch(url);

    if (response.status === 404) {
      // File doesn't exist, use defaults
      return defaultConfig;
    }

    if (!response.ok) {
      console.warn(
        `Failed to fetch .worlddriven.ini for ${owner}/${repo}: ${response.status}`
      );
      return defaultConfig;
    }

    const data = await response.json();

    // GitHub returns content as base64
    if (!data.content) {
      console.warn(
        `.worlddriven.ini found but no content for ${owner}/${repo}`
      );
      return defaultConfig;
    }

    // Decode base64 content
    const content = Buffer.from(data.content, 'base64').toString('utf-8');

    // Parse INI file
    const parsed = parseIniFile(content);

    // Extract configuration from DEFAULT section
    const defaultSection = parsed.DEFAULT || {};

    const config = { ...defaultConfig };

    if (defaultSection.baseMergeTimeInHours) {
      const value = parseFloat(defaultSection.baseMergeTimeInHours);
      if (!isNaN(value) && value >= 0) {
        config.baseMergeTimeInHours = value;
      }
    }

    if (defaultSection.perCommitTimeInHours) {
      const value = parseFloat(defaultSection.perCommitTimeInHours);
      if (!isNaN(value) && value >= 0) {
        config.perCommitTimeInHours = value;
      }
    }

    if (defaultSection.baseCloseTimeInHours) {
      const value = parseFloat(defaultSection.baseCloseTimeInHours);
      if (!isNaN(value) && value >= 0) {
        config.baseCloseTimeInHours = value;
      }
    }

    if (defaultSection.merge_method) {
      const method = defaultSection.merge_method.toLowerCase();
      if (['merge', 'squash', 'rebase'].includes(method)) {
        config.merge_method = method;
      }
    }

    console.log(`Loaded custom config for ${owner}/${repo}:`, config);
    return config;
  } catch (error) {
    console.warn(
      `Error fetching .worlddriven.ini for ${owner}/${repo}:`,
      error.message
    );
    return defaultConfig;
  }
}
