import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { parseIniFile, fetchRepositoryConfig } from '../src/helpers/config.js';

describe('parseIniFile', () => {
  it('should parse simple INI file', () => {
    const ini = `
[DEFAULT]
baseMergeTimeInHours = 240
perCommitTimeInHours = 0
merge_method = squash
`;
    const result = parseIniFile(ini);
    assert.strictEqual(result.DEFAULT.baseMergeTimeInHours, '240');
    assert.strictEqual(result.DEFAULT.perCommitTimeInHours, '0');
    assert.strictEqual(result.DEFAULT.merge_method, 'squash');
  });

  it('should ignore comments', () => {
    const ini = `
# This is a comment
[DEFAULT]
; This is also a comment
baseMergeTimeInHours = 100
`;
    const result = parseIniFile(ini);
    assert.strictEqual(result.DEFAULT.baseMergeTimeInHours, '100');
  });

  it('should handle multiple sections', () => {
    const ini = `
[DEFAULT]
baseMergeTimeInHours = 240

[CUSTOM]
merge_method = merge
`;
    const result = parseIniFile(ini);
    assert.strictEqual(result.DEFAULT.baseMergeTimeInHours, '240');
    assert.strictEqual(result.CUSTOM.merge_method, 'merge');
  });

  it('should ignore empty lines', () => {
    const ini = `

[DEFAULT]

baseMergeTimeInHours = 100

perCommitTimeInHours = 5

`;
    const result = parseIniFile(ini);
    assert.strictEqual(result.DEFAULT.baseMergeTimeInHours, '100');
    assert.strictEqual(result.DEFAULT.perCommitTimeInHours, '5');
  });

  it('should trim whitespace from keys and values', () => {
    const ini = `
[DEFAULT]
  baseMergeTimeInHours  =  100
  perCommitTimeInHours=5
`;
    const result = parseIniFile(ini);
    assert.strictEqual(result.DEFAULT.baseMergeTimeInHours, '100');
    assert.strictEqual(result.DEFAULT.perCommitTimeInHours, '5');
  });
});

describe('fetchRepositoryConfig', () => {
  it('should return default config when file does not exist', async () => {
    const mockGithubClient = {
      getRepository: mock.fn(async () => ({ default_branch: 'main' })),
      fetch: mock.fn(async () => ({ status: 404, ok: false })),
    };

    const config = await fetchRepositoryConfig(
      mockGithubClient,
      'owner',
      'repo'
    );

    assert.strictEqual(config.baseMergeTimeInHours, 240);
    assert.strictEqual(config.perCommitTimeInHours, 0);
    assert.strictEqual(config.merge_method, 'squash');
  });

  it('should parse custom config from repository', async () => {
    const iniContent = `
[DEFAULT]
baseMergeTimeInHours = 20
perCommitTimeInHours = 10
merge_method = merge
`;
    const base64Content = Buffer.from(iniContent).toString('base64');

    const mockGithubClient = {
      getRepository: mock.fn(async () => ({ default_branch: 'main' })),
      fetch: mock.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ content: base64Content }),
      })),
    };

    const config = await fetchRepositoryConfig(
      mockGithubClient,
      'owner',
      'repo'
    );

    assert.strictEqual(config.baseMergeTimeInHours, 20);
    assert.strictEqual(config.perCommitTimeInHours, 10);
    assert.strictEqual(config.merge_method, 'merge');
  });

  it('should validate and reject invalid merge methods', async () => {
    const iniContent = `
[DEFAULT]
merge_method = invalid
`;
    const base64Content = Buffer.from(iniContent).toString('base64');

    const mockGithubClient = {
      getRepository: mock.fn(async () => ({ default_branch: 'main' })),
      fetch: mock.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ content: base64Content }),
      })),
    };

    const config = await fetchRepositoryConfig(
      mockGithubClient,
      'owner',
      'repo'
    );

    assert.strictEqual(config.merge_method, 'squash'); // Should use default
  });

  it('should validate and reject negative time values', async () => {
    const iniContent = `
[DEFAULT]
baseMergeTimeInHours = -100
perCommitTimeInHours = -5
`;
    const base64Content = Buffer.from(iniContent).toString('base64');

    const mockGithubClient = {
      getRepository: mock.fn(async () => ({ default_branch: 'main' })),
      fetch: mock.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ content: base64Content }),
      })),
    };

    const config = await fetchRepositoryConfig(
      mockGithubClient,
      'owner',
      'repo'
    );

    assert.strictEqual(config.baseMergeTimeInHours, 240); // Should use default
    assert.strictEqual(config.perCommitTimeInHours, 0); // Should use default
  });

  it('should accept valid merge methods: merge, squash, rebase', async () => {
    for (const method of ['merge', 'squash', 'rebase']) {
      const iniContent = `
[DEFAULT]
merge_method = ${method}
`;
      const base64Content = Buffer.from(iniContent).toString('base64');

      const mockGithubClient = {
        getRepository: mock.fn(async () => ({ default_branch: 'main' })),
        fetch: mock.fn(async () => ({
          status: 200,
          ok: true,
          json: async () => ({ content: base64Content }),
        })),
      };

      const config = await fetchRepositoryConfig(
        mockGithubClient,
        'owner',
        'repo'
      );

      assert.strictEqual(config.merge_method, method);
    }
  });

  it('should fetch from default branch', async () => {
    const iniContent = `[DEFAULT]\nbaseMergeTimeInHours = 50\n`;
    const base64Content = Buffer.from(iniContent).toString('base64');

    const mockGithubClient = {
      getRepository: mock.fn(async () => ({ default_branch: 'develop' })),
      fetch: mock.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ content: base64Content }),
      })),
    };

    await fetchRepositoryConfig(mockGithubClient, 'owner', 'repo');

    // Verify the fetch was called with the correct URL including default branch
    const fetchCall = mockGithubClient.fetch.mock.calls[0];
    assert.ok(
      fetchCall.arguments[0].includes('ref=develop'),
      'Should fetch from default branch'
    );
  });

  it('should return defaults on fetch error', async () => {
    const mockGithubClient = {
      getRepository: mock.fn(async () => ({ default_branch: 'main' })),
      fetch: mock.fn(async () => {
        throw new Error('Network error');
      }),
    };

    const config = await fetchRepositoryConfig(
      mockGithubClient,
      'owner',
      'repo'
    );

    assert.strictEqual(config.baseMergeTimeInHours, 240);
    assert.strictEqual(config.perCommitTimeInHours, 0);
    assert.strictEqual(config.merge_method, 'squash');
  });

  it('should return defaults when file has no content', async () => {
    const mockGithubClient = {
      getRepository: mock.fn(async () => ({ default_branch: 'main' })),
      fetch: mock.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({}), // No content field
      })),
    };

    const config = await fetchRepositoryConfig(
      mockGithubClient,
      'owner',
      'repo'
    );

    assert.strictEqual(config.baseMergeTimeInHours, 240);
    assert.strictEqual(config.perCommitTimeInHours, 0);
    assert.strictEqual(config.merge_method, 'squash');
  });
});
