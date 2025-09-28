import { test } from 'node:test';
import assert from 'node:assert';
import sinon from 'sinon';

// Setup global fetch mock
global.fetch = sinon.stub();

test('Comment race condition handling', async t => {
  let updateOrCreateWorlddrivenComment;
  let commentIdCounter = 1;
  let createdComments = [];

  t.beforeEach(async () => {
    global.fetch.resetHistory();
    createdComments = [];
    commentIdCounter = 1;

    // Mock GitHub API responses
    global.fetch.callsFake(async (url, options) => {
      if (url.includes('/comments') && !url.includes('/comments/')) {
        if (options?.method === 'POST') {
          // Create comment - simulate delay
          await new Promise(resolve => setTimeout(resolve, 10));
          const newComment = {
            id: commentIdCounter++,
            body: JSON.parse(options.body).body,
          };
          createdComments.push(newComment);
          return { ok: true, json: async () => newComment };
        } else {
          // List comments
          return {
            ok: true,
            json: async () =>
              createdComments.filter(c =>
                c.body.includes('🤖 **Worlddriven Status**')
              ),
          };
        }
      }

      if (url.includes('/comments/') && options?.method === 'PATCH') {
        // Update comment
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
    'should handle race condition with concurrent calls',
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

      console.log('Starting concurrent comment operations...');

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

      console.log('Created comments:', createdComments.length);
      console.log(
        'Comment IDs:',
        createdComments.map(c => c.id)
      );

      // In a race condition, we might get 2 comments instead of 1
      // This test will show the problem exists
      if (createdComments.length > 1) {
        console.log('❌ Race condition detected: Multiple comments created');
        console.log('Comment 1 body length:', createdComments[0].body.length);
        console.log('Comment 2 body length:', createdComments[1].body.length);

        // Both should contain the activity, showing they were created independently
        assert.ok(
          createdComments[0].body.includes('PR opened') ||
            createdComments[0].body.includes('Branch synchronized')
        );
        assert.ok(
          createdComments[1].body.includes('PR opened') ||
            createdComments[1].body.includes('Branch synchronized')
        );
      } else {
        console.log(
          '✅ No race condition: Single comment with both activities'
        );
        assert.ok(createdComments[0].body.includes('PR opened'));
        assert.ok(createdComments[0].body.includes('Branch synchronized'));
      }

      // This test documents the race condition issue
      // (We expect it to fail currently, showing the problem)
      assert.strictEqual(
        createdComments.length,
        1,
        'Should create only one comment, but race condition may cause multiple'
      );
    }
  );

  await t.test('should demonstrate the fix with proper locking', async () => {
    // This test shows how the race condition SHOULD be fixed
    // (Implementation would need to be added to the actual code)

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

    // Simulate a proper implementation with locking/queuing
    let operationQueue = [];
    let isProcessing = false;

    const queuedUpdateOrCreate = async message => {
      return new Promise((resolve, reject) => {
        operationQueue.push({ message, resolve, reject });
        processQueue();
      });
    };

    const processQueue = async () => {
      if (isProcessing || operationQueue.length === 0) return;

      isProcessing = true;
      console.log('Processing queued operations:', operationQueue.length);

      while (operationQueue.length > 0) {
        const operations = operationQueue.splice(0); // Take all pending operations

        // Process all messages in a single update
        const allMessages = operations.map(op => op.message);
        console.log('Processing messages:', allMessages);

        try {
          const result = await updateOrCreateWorlddrivenComment(
            user,
            'test',
            'repo',
            123,
            pullRequestData,
            allMessages.join(', ')
          );

          // Resolve all promises with the same result
          operations.forEach(op => op.resolve(result));
        } catch (error) {
          operations.forEach(op => op.reject(error));
        }
      }

      isProcessing = false;
    };

    // Test the queued approach
    const promise1 = queuedUpdateOrCreate('PR opened');
    const promise2 = queuedUpdateOrCreate('Branch synchronized');

    await Promise.all([promise1, promise2]);

    // With proper queuing, we should have only one comment
    console.log('Queued approach - Created comments:', createdComments.length);

    // This should pass (showing the fix works)
    assert.strictEqual(
      createdComments.length,
      1,
      'Queued approach should create only one comment'
    );
    assert.ok(
      createdComments[0].body.includes('PR opened'),
      'Comment should contain PR opened activity'
    );
    assert.ok(
      createdComments[0].body.includes('Branch synchronized'),
      'Comment should contain Branch synchronized activity'
    );
  });
});
