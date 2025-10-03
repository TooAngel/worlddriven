import { test } from 'node:test';
import assert from 'node:assert';
import sinon from 'sinon';

// Setup global fetch mock
global.fetch = sinon.stub();

test('GitHubClient class', async t => {
  let GitHubClient;
  let mockAuth;

  t.before(async () => {
    const githubClientModule = await import('../src/helpers/github-client.js');
    GitHubClient = githubClientModule.GitHubClient;
  });

  t.beforeEach(() => {
    // Reset fetch stub
    global.fetch.reset();

    // Create mock auth with different authentication methods
    mockAuth = {
      getAllMethods: sinon.stub().resolves([
        {
          type: 'PAT',
          user: { githubAccessToken: 'test-token' },
          priority: 1,
          description: 'Test PAT',
        },
        {
          type: 'ENV',
          token: 'env-token',
          priority: 4,
          description: 'Environment token',
        },
      ]),
    };
  });

  await t.test('should make successful PAT request', async () => {
    global.fetch.resolves({
      ok: true,
      json: async () => ({ test: 'data' }),
    });

    const client = new GitHubClient(mockAuth);
    const result = await client.makeRequest('/test');

    assert.deepStrictEqual(result, { test: 'data' });
    assert.strictEqual(global.fetch.calledOnce, true);

    const [url, options] = global.fetch.getCall(0).args;
    assert.strictEqual(url, 'https://api.github.com/test');
    assert.strictEqual(options.headers.Authorization, 'token test-token');
  });

  await t.test('should fallback to next auth method on failure', async () => {
    // First call fails (PAT), second succeeds (ENV)
    global.fetch
      .onFirstCall()
      .resolves({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      })
      .onSecondCall()
      .resolves({
        ok: true,
        json: async () => ({ fallback: 'success' }),
      });

    const client = new GitHubClient(mockAuth);
    const result = await client.makeRequest('/test');

    assert.deepStrictEqual(result, { fallback: 'success' });
    assert.strictEqual(global.fetch.callCount, 2);

    // Check that second call used environment token
    const [, secondOptions] = global.fetch.getCall(1).args;
    assert.strictEqual(secondOptions.headers.Authorization, 'token env-token');
  });

  await t.test('should throw error when all auth methods fail', async () => {
    global.fetch.resolves({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const client = new GitHubClient(mockAuth);

    await assert.rejects(
      () => client.makeRequest('/test'),
      /All authentication methods failed/
    );

    assert.strictEqual(global.fetch.callCount, 2); // Tried both methods
  });

  await t.test('should handle no authentication methods', async () => {
    mockAuth.getAllMethods.resolves([]);

    const client = new GitHubClient(mockAuth);

    await assert.rejects(
      () => client.makeRequest('/test'),
      /No authentication methods available/
    );

    assert.strictEqual(global.fetch.callCount, 0);
  });

  await t.test('should get contributors with proper formatting', async () => {
    global.fetch.resolves({
      ok: true,
      json: async () => [
        { login: 'user1', contributions: 10 },
        { login: 'user2', contributions: 5 },
      ],
    });

    const client = new GitHubClient(mockAuth);
    const result = await client.getContributors(
      'https://api.github.com/repos/test/repo/contributors'
    );

    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], {
      name: 'user1',
      commits: 10,
      reviewValue: 0,
      timeValue: '',
    });
    assert.deepStrictEqual(result[1], {
      name: 'user2',
      commits: 5,
      reviewValue: 0,
      timeValue: '',
    });
  });

  await t.test('should get pull requests with proper formatting', async () => {
    global.fetch.resolves({
      ok: true,
      json: async () => [
        { id: 1, title: 'PR 1', number: 1 },
        { id: 2, title: 'PR 2', number: 2 },
      ],
    });

    const client = new GitHubClient(mockAuth);
    const result = await client.getPullRequests('owner', 'repo');

    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], { id: 1, title: 'PR 1', number: 1 });
    assert.deepStrictEqual(result[1], { id: 2, title: 'PR 2', number: 2 });

    const [url] = global.fetch.getCall(0).args;
    assert.strictEqual(
      url,
      'https://api.github.com/repos/owner/repo/pulls?state=open'
    );
  });

  await t.test(
    'should handle merge pull request gracefully when cannot merge',
    async () => {
      // Mock a successful auth call that returns 405 for merge
      global.fetch.resolves({
        ok: false,
        status: 405,
        statusText: 'Method Not Allowed',
      });

      // Use a simpler mock auth that won't try fallbacks
      const simpleAuth = {
        getAllMethods: sinon.stub().resolves([
          {
            type: 'PAT',
            user: { githubAccessToken: 'test-token' },
            priority: 1,
            description: 'Test PAT',
          },
        ]),
      };

      const client = new GitHubClient(simpleAuth);

      // The mergePullRequest method should handle 405 errors gracefully
      const result = await client.mergePullRequest('owner', 'repo', 123);

      assert.strictEqual(result, null); // Should return null for 405 errors
    }
  );

  await t.test('should create issue comment with proper request', async () => {
    global.fetch.resolves({
      ok: true,
      json: async () => ({ id: 456, body: 'Test comment' }),
    });

    const client = new GitHubClient(mockAuth);
    const result = await client.createIssueComment(
      'owner',
      'repo',
      123,
      'Test comment'
    );

    assert.deepStrictEqual(result, { id: 456, body: 'Test comment' });

    const [url, options] = global.fetch.getCall(0).args;
    assert.strictEqual(
      url,
      'https://api.github.com/repos/owner/repo/issues/123/comments'
    );
    assert.strictEqual(options.method, 'POST');
    assert.strictEqual(options.headers['Content-Type'], 'application/json');

    const body = JSON.parse(options.body);
    assert.strictEqual(body.body, 'Test comment');
  });

  await t.test('should handle URLs with and without https prefix', async () => {
    global.fetch.resolves({
      ok: true,
      json: async () => ({ test: 'data' }),
    });

    const client = new GitHubClient(mockAuth);

    // Test with full URL
    await client.makeRequest('https://api.github.com/test/full');
    // Test with path only
    await client.makeRequest('/test/path');

    assert.strictEqual(global.fetch.callCount, 2);

    const [firstUrl] = global.fetch.getCall(0).args;
    const [secondUrl] = global.fetch.getCall(1).args;

    assert.strictEqual(firstUrl, 'https://api.github.com/test/full');
    assert.strictEqual(secondUrl, 'https://api.github.com/test/path');
  });

  await t.test('should cache auth methods after first call', async () => {
    global.fetch.resolves({
      ok: true,
      json: async () => ({ test: 'data' }),
    });

    const client = new GitHubClient(mockAuth);

    // Make two requests
    await client.makeRequest('/test1');
    await client.makeRequest('/test2');

    // Auth should only be called once
    assert.strictEqual(mockAuth.getAllMethods.callCount, 1);
  });

  await t.test('should provide auth info for debugging', async () => {
    mockAuth.getAuthStrategy = sinon.stub().resolves('Test auth strategy');

    const client = new GitHubClient(mockAuth);
    const authInfo = await client.getAuthInfo();

    assert.strictEqual(authInfo, 'Test auth strategy');
    assert.strictEqual(mockAuth.getAuthStrategy.calledOnce, true);
  });
});
