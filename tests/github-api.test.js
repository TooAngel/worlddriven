import { test } from 'node:test';
import assert from 'node:assert';
import sinon from 'sinon';

// Setup global fetch mock
global.fetch = sinon.stub();

test('GitHub API helpers', async t => {
  let listIssueComments, updateIssueComment, findWorlddrivenComment;

  t.beforeEach(async () => {
    // Reset call history but keep the configured behavior
    if (global.fetch.resetHistory) {
      global.fetch.resetHistory();
    }

    // Import the functions fresh for each test
    const githubModule = await import('../src/helpers/github.js');
    listIssueComments = githubModule.listIssueComments;
    updateIssueComment = githubModule.updateIssueComment;
    findWorlddrivenComment = githubModule.findWorlddrivenComment;
  });

  await t.test(
    'listIssueComments should fetch comments from GitHub API',
    async () => {
      const mockComments = [
        { id: 1, body: 'First comment' },
        { id: 2, body: '🤖 **Worlddriven Status**\nSome status' },
      ];

      global.fetch.resolves({
        ok: true,
        json: async () => mockComments,
      });

      const user = { githubAccessToken: 'test-token' };
      const result = await listIssueComments(user, 'owner', 'repo', 123);

      assert.strictEqual(global.fetch.calledOnce, true);
      assert.strictEqual(
        global.fetch.getCall(0).args[0],
        'https://api.github.com/repos/owner/repo/issues/123/comments'
      );

      const fetchOptions = global.fetch.getCall(0).args[1];
      assert.strictEqual(
        fetchOptions.headers.Authorization,
        'token test-token'
      );
      assert.deepStrictEqual(result, mockComments);
    }
  );

  await t.test(
    'listIssueComments should handle GitHub API errors',
    async () => {
      global.fetch.resolves({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const user = { githubAccessToken: 'test-token' };

      await assert.rejects(
        () => listIssueComments(user, 'owner', 'repo', 123),
        /HTTP 404: Not Found/
      );
    }
  );

  await t.test(
    'listIssueComments should reject GitHub App auth (not implemented)',
    async () => {
      await assert.rejects(
        () => listIssueComments(12345, 'owner', 'repo', 123),
        /GitHub App authentication not yet implemented/
      );
    }
  );

  await t.test(
    'updateIssueComment should update comment via GitHub API',
    async () => {
      const mockResponse = { id: 456, body: 'Updated comment' };

      global.fetch.resolves({
        ok: true,
        json: async () => mockResponse,
      });

      const user = { githubAccessToken: 'test-token' };
      const result = await updateIssueComment(
        user,
        'owner',
        'repo',
        456,
        'Updated comment'
      );

      assert.strictEqual(global.fetch.calledOnce, true);
      assert.strictEqual(
        global.fetch.getCall(0).args[0],
        'https://api.github.com/repos/owner/repo/issues/comments/456'
      );

      const fetchOptions = global.fetch.getCall(0).args[1];
      assert.strictEqual(fetchOptions.method, 'PATCH');
      assert.strictEqual(
        fetchOptions.headers.Authorization,
        'token test-token'
      );
      assert.strictEqual(
        fetchOptions.headers['Content-Type'],
        'application/json'
      );

      const requestBody = JSON.parse(fetchOptions.body);
      assert.strictEqual(requestBody.body, 'Updated comment');
      assert.deepStrictEqual(result, mockResponse);
    }
  );

  await t.test(
    'updateIssueComment should handle GitHub API errors',
    async () => {
      global.fetch.resolves({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      const user = { githubAccessToken: 'test-token' };

      await assert.rejects(
        () => updateIssueComment(user, 'owner', 'repo', 456, 'Updated comment'),
        /HTTP 403: Forbidden/
      );
    }
  );

  await t.test(
    'updateIssueComment should reject GitHub App auth (not implemented)',
    async () => {
      await assert.rejects(
        () =>
          updateIssueComment(12345, 'owner', 'repo', 456, 'Updated comment'),
        /GitHub App authentication not yet implemented/
      );
    }
  );

  await t.test(
    'findWorlddrivenComment should be properly exported',
    async () => {
      // Simple test to check function exists without complex mocking
      assert.ok(typeof findWorlddrivenComment === 'function');
    }
  );
});
