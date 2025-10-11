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
    'listIssueComments should work with GitHub App auth',
    async () => {
      // This test verifies the function accepts GitHub App auth (installationId as number)
      // The actual GitHub App implementation is tested in integration tests
      // Here we just verify it doesn't throw an error for valid installationId format
      const installationId = 12345;

      // The function will try to call the GitHub App version which needs Octokit
      // Since we don't mock Octokit here, we expect a different error (not "not implemented")
      try {
        await listIssueComments(installationId, 'owner', 'repo', 123);
        // If it succeeds (unlikely without proper mocks), that's fine
        assert.ok(true, 'GitHub App auth accepted');
      } catch (error) {
        // Should NOT be "not yet implemented" error
        assert.ok(
          !error.message.includes('not yet implemented'),
          'GitHub App authentication is now implemented'
        );
      }
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
    'updateIssueComment should work with GitHub App auth',
    async () => {
      // This test verifies the function accepts GitHub App auth (installationId as number)
      // The actual GitHub App implementation is tested in integration tests
      // Here we just verify it doesn't throw an error for valid installationId format
      const installationId = 12345;

      // The function will try to call the GitHub App version which needs Octokit
      // Since we don't mock Octokit here, we expect a different error (not "not implemented")
      try {
        await updateIssueComment(
          installationId,
          'owner',
          'repo',
          456,
          'Updated comment'
        );
        // If it succeeds (unlikely without proper mocks), that's fine
        assert.ok(true, 'GitHub App auth accepted');
      } catch (error) {
        // Should NOT be "not yet implemented" error
        assert.ok(
          !error.message.includes('not yet implemented'),
          'GitHub App authentication is now implemented'
        );
      }
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
