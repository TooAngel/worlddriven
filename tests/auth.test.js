import { test } from 'node:test';
import assert from 'node:assert';
import sinon from 'sinon';
import './setup.js';
import { Repository } from '../src/database/models.js';
import { Auth } from '../src/helpers/auth.js';

test('Auth class', async t => {
  let findByOwnerAndRepoStub;

  t.beforeEach(() => {
    // Mock Repository.findByOwnerAndRepo at module level
    findByOwnerAndRepoStub = sinon.stub(Repository, 'findByOwnerAndRepo');

    // Clear environment variable
    delete process.env.WORLDDRIVEN_GITHUB_TOKEN;
  });

  t.afterEach(() => {
    // Restore original implementation
    findByOwnerAndRepoStub.restore();
  });

  await t.test('should create auth with minimal parameters', async () => {
    const auth = new Auth({ owner: 'test', repo: 'repo' });
    assert.ok(auth);
    assert.strictEqual(auth.owner, 'test');
    assert.strictEqual(auth.repo, 'repo');
  });

  await t.test(
    'should return empty methods when no auth available',
    async () => {
      findByOwnerAndRepoStub.resolves(null);

      const auth = new Auth({ owner: 'test', repo: 'repo' });
      const methods = await auth.getAllMethods();

      assert.strictEqual(methods.length, 0);
      assert.strictEqual(await auth.hasValidAuth(), false);
    }
  );

  await t.test('should prioritize GitHub App when available', async () => {
    // Mock repository WITHOUT 'configured' field (matches actual schema after PR #306)
    const mockRepo = {
      owner: 'test',
      repo: 'repo',
      installationId: 12345,
    };
    findByOwnerAndRepoStub.resolves(mockRepo);

    const auth = new Auth({ owner: 'test', repo: 'repo' });
    const methods = await auth.getAllMethods();

    assert.strictEqual(methods.length, 1);
    assert.strictEqual(methods[0].type, 'APP');
    assert.strictEqual(methods[0].priority, 1);
    assert.strictEqual(methods[0].installationId, 12345);
    assert.strictEqual(methods[0].description, 'Repository GitHub App');
  });

  await t.test('should use both GitHub App and fallback token', async () => {
    // Mock repository WITHOUT 'configured' field
    const mockRepo = {
      owner: 'test',
      repo: 'repo',
      installationId: 12345,
    };
    findByOwnerAndRepoStub.resolves(mockRepo);
    process.env.WORLDDRIVEN_GITHUB_TOKEN = 'env-token';

    const auth = new Auth({ owner: 'test', repo: 'repo' });
    const methods = await auth.getAllMethods();

    assert.strictEqual(methods.length, 2);
    assert.strictEqual(methods[0].type, 'APP');
    assert.strictEqual(methods[0].priority, 1);
    assert.strictEqual(methods[1].type, 'ENV');
    assert.strictEqual(methods[1].priority, 2);
  });

  await t.test('should add environment token when available', async () => {
    process.env.WORLDDRIVEN_GITHUB_TOKEN = 'env-token';
    findByOwnerAndRepoStub.resolves(null);

    const auth = new Auth({ owner: 'test', repo: 'repo' });
    const methods = await auth.getAllMethods();

    assert.strictEqual(methods.length, 1);
    assert.strictEqual(methods[0].type, 'ENV');
    assert.strictEqual(methods[0].priority, 2);
    assert.strictEqual(methods[0].token, 'env-token');
    assert.strictEqual(methods[0].description, 'Worlddriven GitHub token');
  });

  await t.test('should provide auth strategy description', async () => {
    // Mock repository WITHOUT 'configured' field
    const mockRepo = {
      owner: 'test',
      repo: 'repo',
      installationId: 12345,
    };
    findByOwnerAndRepoStub.resolves(mockRepo);
    process.env.WORLDDRIVEN_GITHUB_TOKEN = 'env-token';

    const auth = new Auth({ owner: 'test', repo: 'repo' });
    const strategy = await auth.getAuthStrategy();

    assert.ok(strategy.includes('Auth strategy (with fallbacks)'));
    assert.ok(strategy.includes('1. Repository GitHub App'));
    assert.ok(strategy.includes('2. Worlddriven GitHub token'));
  });

  await t.test('should cache methods on repeated calls', async () => {
    // Mock repository WITHOUT 'configured' field
    const mockRepo = {
      owner: 'test',
      repo: 'repo',
      installationId: 12345,
    };
    findByOwnerAndRepoStub.resolves(mockRepo);

    const auth = new Auth({ owner: 'test', repo: 'repo' });

    // First call
    const methods1 = await auth.getAllMethods();
    // Second call should use cache
    const methods2 = await auth.getAllMethods();

    assert.strictEqual(methods1, methods2); // Same reference
    assert.strictEqual(findByOwnerAndRepoStub.callCount, 1); // Only called once
  });

  await t.test('should handle repository without installationId', async () => {
    // Repository exists but has no installationId
    const mockRepo = {
      owner: 'test',
      repo: 'repo',
      // No installationId
    };
    findByOwnerAndRepoStub.resolves(mockRepo);

    const auth = new Auth({ owner: 'test', repo: 'repo' });
    const methods = await auth.getAllMethods();

    // Should have no GitHub App method
    assert.strictEqual(methods.length, 0);
    assert.strictEqual(await auth.hasValidAuth(), false);
  });

  await t.test(
    'REGRESSION: should work with installationId but no configured field',
    async () => {
      // This is the exact scenario that caused the bug:
      // After PR #306, 'configured' field was removed from schema
      // Auth class was still checking for it, causing all repos to fail
      const mockRepo = {
        owner: 'test',
        repo: 'repo',
        installationId: 12345,
        // NOTE: No 'configured' field - this matches the actual schema
      };
      findByOwnerAndRepoStub.resolves(mockRepo);

      const auth = new Auth({ owner: 'test', repo: 'repo' });
      const methods = await auth.getAllMethods();

      // Should work correctly - the fix removed the configured check
      assert.strictEqual(methods.length, 1);
      assert.strictEqual(methods[0].type, 'APP');
      assert.strictEqual(methods[0].installationId, 12345);
    }
  );
});
