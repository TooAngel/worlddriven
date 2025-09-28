import { test } from 'node:test';
import assert from 'node:assert';
import sinon from 'sinon';

// Setup global fetch mock
global.fetch = sinon.stub();

test('Comment race condition fix', async t => {
  let updateOrCreateWorlddrivenComment;
  let commentIdCounter = 1;
  let createdComments = [];
  let apiCallOrder = [];

  t.beforeEach(async () => {
    global.fetch.resetHistory();
    createdComments = [];
    commentIdCounter = 1;
    apiCallOrder = [];

    // Mock GitHub API responses with logging
    global.fetch.callsFake(async (url, options) => {
      if (url.includes('/comments') && !url.includes('/comments/')) {
        if (options?.method === 'POST') {
          // Create comment
          apiCallOrder.push('CREATE');
          const newComment = {
            id: commentIdCounter++,
            body: JSON.parse(options.body).body,
          };
          createdComments.push(newComment);
          return { ok: true, json: async () => newComment };
        } else {
          // List comments - simulate the race condition timing
          apiCallOrder.push('LIST');
          const existingComments = createdComments.filter(c =>
            c.body.includes('🤖 **Worlddriven Status**')
          );
          return {
            ok: true,
            json: async () => existingComments,
          };
        }
      }

      if (url.includes('/comments/') && options?.method === 'PATCH') {
        // Update comment
        apiCallOrder.push('UPDATE');
        const commentId = parseInt(url.split('/comments/')[1]);
        const comment = createdComments.find(c => c.id === commentId);
        if (comment) {
          comment.body = JSON.parse(options.body).body;
        }
        return { ok: true, json: async () => comment };
      }

      return { ok: true, json: async () => ({}) };
    });

    const commentModule = await import('../src/helpers/commentManager.js');
    updateOrCreateWorlddrivenComment =
      commentModule.updateOrCreateWorlddrivenComment;
  });

  await t.test(
    'should prevent race condition with locking mechanism',
    async () => {
      const user = { githubAccessToken: 'test-token' };
      const pullRequestData = {
        stats: { votes: 5, votesTotal: 10, coefficient: 0.5 },
        times: {
          mergeDate: Date.now() / 1000 + 86400,
          totalMergeTime: 172800,
          mergeDuration: 86400,
        },
        dates: { max: Date.now() - 3600000 },
      };

      console.log('Starting concurrent comment operations with fix...');

      // Simulate race condition: two webhook events arrive nearly simultaneously
      const promise1 = updateOrCreateWorlddrivenComment(
        user,
        'test',
        'repo',
        123,
        pullRequestData,
        'PR opened'
      );

      const promise2 = updateOrCreateWorlddrivenComment(
        user,
        'test',
        'repo',
        123,
        pullRequestData,
        'Branch synchronized'
      );

      // Wait for both to complete
      await Promise.all([promise1, promise2]);

      console.log('API call order:', apiCallOrder);
      console.log('Created comments:', createdComments.length);
      console.log('Final comment activities:');
      if (createdComments[0]) {
        const activities =
          createdComments[0].body.match(/• \*\*.*?\*\* - (.*)/g);
        activities?.forEach((activity, i) =>
          console.log(`  ${i + 1}. ${activity}`)
        );
      }

      // With the fix, we should have only one comment
      assert.strictEqual(
        createdComments.length,
        1,
        'Should create only one comment even with concurrent calls'
      );

      // The comment should contain both activities
      const comment = createdComments[0];
      assert.ok(
        comment.body.includes('PR opened'),
        'Comment should contain first activity'
      );
      assert.ok(
        comment.body.includes('Branch synchronized'),
        'Comment should contain second activity'
      );

      // The API calls should show proper serialization
      // First call: LIST (no existing) -> CREATE
      // Second call: LIST (finds existing) -> UPDATE
      const expectedPattern = ['LIST', 'CREATE', 'LIST', 'UPDATE'];
      assert.deepStrictEqual(
        apiCallOrder,
        expectedPattern,
        'API calls should be properly serialized'
      );
    }
  );

  await t.test('should handle multiple rapid concurrent calls', async () => {
    const user = { githubAccessToken: 'test-token' };
    const pullRequestData = {
      stats: { votes: 5, votesTotal: 10, coefficient: 0.5 },
      times: {
        mergeDate: Date.now() / 1000 + 86400,
        totalMergeTime: 172800,
        mergeDuration: 86400,
      },
      dates: { max: Date.now() - 3600000 },
    };

    console.log('Testing multiple rapid concurrent calls...');

    // Simulate even more concurrent calls
    const promises = [
      updateOrCreateWorlddrivenComment(
        user,
        'test',
        'repo',
        456,
        pullRequestData,
        'PR opened'
      ),
      updateOrCreateWorlddrivenComment(
        user,
        'test',
        'repo',
        456,
        pullRequestData,
        'Review submitted'
      ),
      updateOrCreateWorlddrivenComment(
        user,
        'test',
        'repo',
        456,
        pullRequestData,
        'Branch synchronized'
      ),
      updateOrCreateWorlddrivenComment(
        user,
        'test',
        'repo',
        456,
        pullRequestData,
        'CI passed'
      ),
    ];

    await Promise.all(promises);

    // Filter comments for this specific PR (456)
    const pr456Comments = createdComments.filter(
      c =>
        c.body.includes('test/repo/pull/456') ||
        c.body.includes('PR opened') ||
        c.body.includes('Review submitted') ||
        c.body.includes('Branch synchronized') ||
        c.body.includes('CI passed')
    );

    console.log('Comments for PR #456:', pr456Comments.length);

    // Should still have only one comment for this PR
    assert.strictEqual(
      pr456Comments.length,
      1,
      'Should create only one comment even with 4 concurrent calls'
    );

    // The comment should contain all activities
    const comment = pr456Comments[0];
    assert.ok(
      comment.body.includes('PR opened'),
      'Should contain first activity'
    );
    assert.ok(
      comment.body.includes('Review submitted'),
      'Should contain second activity'
    );
    assert.ok(
      comment.body.includes('Branch synchronized'),
      'Should contain third activity'
    );
    assert.ok(
      comment.body.includes('CI passed'),
      'Should contain fourth activity'
    );
  });
});
