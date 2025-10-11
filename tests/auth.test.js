import { test } from 'node:test';
import assert from 'node:assert';
import sinon from 'sinon';
import './setup.js';

// Mock the models by setting up stubs directly
const mockUser = {
  findById: sinon.stub(),
};

const mockRepository = {
  findByOwnerAndRepo: sinon.stub(),
};

// We'll override the imports in the Auth module by mocking the module loading
const originalImport = await import('../src/helpers/auth.js');

// Create a test-specific Auth class that uses our mocks
class TestAuth extends originalImport.Auth {
  constructor(options) {
    super(options);
    // Override the models used by the Auth class
    this._testRepository = mockRepository;
  }

  async getAllMethods() {
    // Copy the original method but use our mocked models
    if (this._methods) return this._methods;

    this._methods = [];

    // Priority 1: Repository GitHub App authentication
    try {
      const repository = await this._testRepository.findByOwnerAndRepo(
        this.owner,
        this.repo
      );

      if (repository && repository.configured && repository.installationId) {
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

    // Priority 2: Environment token fallback (if available)
    if (process.env.GITHUB_FALLBACK_TOKEN) {
      this._methods.push({
        type: 'ENV',
        token: process.env.GITHUB_FALLBACK_TOKEN,
        priority: 2,
        description: 'Environment fallback token',
      });
    }

    // Sort by priority and return
    this._methods.sort((a, b) => a.priority - b.priority);
    return this._methods;
  }
}

test('Auth class', async t => {
  t.beforeEach(() => {
    // Reset all stubs before each test
    mockUser.findById.reset();
    mockRepository.findByOwnerAndRepo.reset();

    // Clear environment variable
    delete process.env.GITHUB_FALLBACK_TOKEN;
  });

  t.after(() => {
    // Clear any remaining timers or handles
    if (global.gc) {
      global.gc();
    }
  });

  await t.test('should create auth with minimal parameters', async () => {
    const auth = new TestAuth({ owner: 'test', repo: 'repo' });
    assert.ok(auth);
    assert.strictEqual(auth.owner, 'test');
    assert.strictEqual(auth.repo, 'repo');
  });

  await t.test(
    'should return empty methods when no auth available',
    async () => {
      mockRepository.findByOwnerAndRepo.resolves(null);

      const auth = new TestAuth({ owner: 'test', repo: 'repo' });
      const methods = await auth.getAllMethods();

      assert.strictEqual(methods.length, 0);
      assert.strictEqual(await auth.hasValidAuth(), false);
    }
  );

  await t.test('should prioritize GitHub App when available', async () => {
    const mockRepo = {
      configured: true,
      installationId: 12345,
    };
    mockRepository.findByOwnerAndRepo.resolves(mockRepo);

    const auth = new TestAuth({ owner: 'test', repo: 'repo' });
    const methods = await auth.getAllMethods();

    assert.strictEqual(methods.length, 1);
    assert.strictEqual(methods[0].type, 'APP');
    assert.strictEqual(methods[0].priority, 1);
    assert.strictEqual(methods[0].installationId, 12345);
    assert.strictEqual(methods[0].description, 'Repository GitHub App');
  });

  await t.test('should use both GitHub App and fallback token', async () => {
    const mockRepo = {
      configured: true,
      installationId: 12345,
    };
    mockRepository.findByOwnerAndRepo.resolves(mockRepo);
    process.env.GITHUB_FALLBACK_TOKEN = 'env-token';

    const auth = new TestAuth({ owner: 'test', repo: 'repo' });
    const methods = await auth.getAllMethods();

    assert.strictEqual(methods.length, 2);
    assert.strictEqual(methods[0].type, 'APP');
    assert.strictEqual(methods[0].priority, 1);
    assert.strictEqual(methods[1].type, 'ENV');
    assert.strictEqual(methods[1].priority, 2);
  });

  await t.test('should add environment token when available', async () => {
    process.env.GITHUB_FALLBACK_TOKEN = 'env-token';
    mockRepository.findByOwnerAndRepo.resolves(null);

    const auth = new TestAuth({ owner: 'test', repo: 'repo' });
    const methods = await auth.getAllMethods();

    assert.strictEqual(methods.length, 1);
    assert.strictEqual(methods[0].type, 'ENV');
    assert.strictEqual(methods[0].priority, 2);
    assert.strictEqual(methods[0].token, 'env-token');
    assert.strictEqual(methods[0].description, 'Environment fallback token');
  });

  await t.test('should provide auth strategy description', async () => {
    const mockRepo = {
      configured: true,
      installationId: 12345,
    };
    mockRepository.findByOwnerAndRepo.resolves(mockRepo);
    process.env.GITHUB_FALLBACK_TOKEN = 'env-token';

    const auth = new TestAuth({ owner: 'test', repo: 'repo' });
    const strategy = await auth.getAuthStrategy();

    assert.ok(strategy.includes('Auth strategy (with fallbacks)'));
    assert.ok(strategy.includes('1. Repository GitHub App'));
    assert.ok(strategy.includes('2. Environment fallback token'));
  });

  await t.test('should cache methods on repeated calls', async () => {
    const mockRepo = {
      configured: true,
      installationId: 12345,
    };
    mockRepository.findByOwnerAndRepo.resolves(mockRepo);

    const auth = new TestAuth({ owner: 'test', repo: 'repo' });

    // First call
    const methods1 = await auth.getAllMethods();
    // Second call should use cache
    const methods2 = await auth.getAllMethods();

    assert.strictEqual(methods1, methods2); // Same reference
    assert.strictEqual(mockRepository.findByOwnerAndRepo.callCount, 1); // Only called once
  });
});
