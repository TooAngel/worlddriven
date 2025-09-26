import { test } from 'node:test';
import assert from 'node:assert';
import './setup.js';

test('Comment manager basic functionality', async t => {
  let generateWorlddrivenComment;

  t.before(async () => {
    const commentModule = await import('../src/helpers/commentManager.js');
    generateWorlddrivenComment = commentModule.generateWorlddrivenComment;
  });

  const createSamplePullRequestData = () => ({
    times: {
      mergeDate: (Date.now() + 5 * 24 * 60 * 60 * 1000) / 1000,
      totalMergeTime: 7 * 24 * 60 * 60,
      mergeDuration: 5 * 24 * 60 * 60,
    },
    dates: {
      max: Date.now() - 2 * 24 * 60 * 60 * 1000,
    },
    stats: {
      votes: 3,
      votesTotal: 5,
      coefficient: 0.75,
    },
  });

  await t.test(
    'generateWorlddrivenComment should create proper structure',
    async () => {
      const pullRequestData = createSamplePullRequestData();
      const activityLog = [
        { date: '2025-09-24, 10:00:00', message: 'Pull request opened' },
      ];

      const result = generateWorlddrivenComment(
        pullRequestData,
        'testowner',
        'testrepo',
        123,
        activityLog
      );

      // Check basic structure
      assert.ok(result.includes('🤖 **Worlddriven Status**'));
      assert.ok(result.includes('📊 **Live Status Dashboard**'));
      assert.ok(result.includes('🎯 **Want to influence when this merges?**'));
      assert.ok(result.includes('📋 **Recent Activity**'));

      // Check correct image paths (fixed from /static/images/ to /images/)
      assert.ok(
        result.includes(
          'https://www.worlddriven.org/images/github-files-changed.png'
        )
      );
      assert.ok(
        result.includes('https://www.worlddriven.org/images/github-approve.png')
      );
      assert.ok(
        result.includes(
          'https://www.worlddriven.org/images/github-request-changes.png'
        )
      );

      // Check dashboard link
      assert.ok(
        result.includes(
          'https://www.worlddriven.org/testowner/testrepo/pull/123'
        )
      );

      // Check activity log
      assert.ok(result.includes('Pull request opened'));

      // Check vote display
      assert.ok(result.includes('✅ **Positive votes:**'));
      assert.ok(result.includes('contribution weight'));
    }
  );

  await t.test(
    'generateWorlddrivenComment should handle empty activity log',
    async () => {
      const pullRequestData = createSamplePullRequestData();

      const result = generateWorlddrivenComment(
        pullRequestData,
        'testowner',
        'testrepo',
        123,
        []
      );

      assert.ok(result.includes('• *No activity yet*'));
    }
  );

  await t.test(
    'generateWorlddrivenComment should calculate metrics correctly',
    async () => {
      const pullRequestData = createSamplePullRequestData();
      pullRequestData.stats.votes = 7;
      pullRequestData.stats.votesTotal = 10;

      const result = generateWorlddrivenComment(
        pullRequestData,
        'testowner',
        'testrepo',
        123,
        []
      );

      // Should show 7/10 positive votes and coefficient
      assert.ok(
        result.includes('✅ **Positive votes:** 7/10 contribution weight')
      );
      assert.ok(result.includes('coefficient: 0.75'));
    }
  );
});
