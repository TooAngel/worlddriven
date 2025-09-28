import { test } from 'node:test';
import assert from 'node:assert';
import './setup.js';

test('Comment generation system', async t => {
  let generateWorlddrivenComment;

  t.before(async () => {
    const commentModule = await import('../src/helpers/commentManager.js');
    generateWorlddrivenComment = commentModule.generateWorlddrivenComment;
  });

  // Create sample pull request data for testing
  const createSamplePullRequestData = (overrides = {}) => {
    const now = Date.now();
    const baseTime = 7 * 24 * 60 * 60; // 7 days in seconds
    const currentTime = 5 * 24 * 60 * 60; // 5 days in seconds (faster due to reviews)

    return {
      times: {
        mergeDate: (now + currentTime * 1000) / 1000, // Unix timestamp in seconds
        totalMergeTime: baseTime,
        mergeDuration: currentTime,
      },
      dates: {
        max: now - 2 * 24 * 60 * 60 * 1000, // Started 2 days ago
      },
      stats: {
        votes: 3,
        votesTotal: 5,
        coefficient: 0.75,
      },
      ...overrides,
    };
  };

  await t.test(
    'generateWorlddrivenComment should create complete comment structure',
    async () => {
      const pullRequestData = createSamplePullRequestData();
      const activityLog = [
        { date: '2025-09-24, 10:00:00', message: 'Pull request opened' },
        { date: '2025-09-24, 14:30:00', message: '@user1 **agreed** ✅' },
      ];

      const result = generateWorlddrivenComment(
        pullRequestData,
        'testowner',
        'testrepo',
        123,
        activityLog
      );

      // Check that all three sections are present
      assert.ok(result.includes('🤖 **Worlddriven Status**'));
      assert.ok(result.includes('📊 **Live Status Dashboard**'));
      assert.ok(result.includes('🎯 **Want to influence when this merges?**'));
      assert.ok(result.includes('📋 **Recent Activity**'));

      // Check status section content
      assert.ok(result.includes('Merge Date:'));
      assert.ok(result.includes('Started:'));
      assert.ok(result.includes('Speed Factor:'));
      assert.ok(
        result.includes('✅ **Positive votes:** 3/5 contribution weight')
      );
      assert.ok(result.includes('coefficient: 0.75'));

      // Check instructions section
      assert.ok(result.includes('Your review matters!'));
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
      assert.ok(
        result.includes(
          'https://www.worlddriven.org/testowner/testrepo/pull/123'
        )
      );

      // Check activity log
      assert.ok(result.includes('Pull request opened'));
      assert.ok(result.includes('@user1 **agreed** ✅'));

      // Check footer
      assert.ok(
        result.includes(
          'This comment is automatically updated by [worlddriven]'
        )
      );
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

      assert.ok(result.includes('📋 **Recent Activity**'));
      assert.ok(result.includes('• *No activity yet*'));
    }
  );

  await t.test(
    'generateWorlddrivenComment should handle undefined activity log',
    async () => {
      const pullRequestData = createSamplePullRequestData();

      const result = generateWorlddrivenComment(
        pullRequestData,
        'testowner',
        'testrepo',
        123
      );

      assert.ok(result.includes('📋 **Recent Activity**'));
      assert.ok(result.includes('• *No activity yet*'));
    }
  );

  await t.test(
    'generateWorlddrivenComment should calculate speed metrics correctly',
    async () => {
      // Test case: PR is 30% faster (base: 10 days, current: 7 days)
      const pullRequestData = createSamplePullRequestData({
        times: {
          mergeDate: Date.now() / 1000 + 7 * 24 * 60 * 60,
          totalMergeTime: 10 * 24 * 60 * 60, // 10 days base time
          mergeDuration: 7 * 24 * 60 * 60, // 7 days current time
        },
      });

      const result = generateWorlddrivenComment(
        pullRequestData,
        'testowner',
        'testrepo',
        123,
        []
      );

      assert.ok(result.includes('**Speed Factor:** 0.70'));
      assert.ok(result.includes('30% faster due to reviews'));
      assert.ok(
        result.includes('**Base Merge Time:** 10 days → **Current:** 7 days')
      );
    }
  );

  await t.test(
    'generateWorlddrivenComment should show slower merge when reviews are negative',
    async () => {
      // Test case: PR is 20% slower (base: 5 days, current: 6 days)
      const pullRequestData = createSamplePullRequestData({
        times: {
          mergeDate: Date.now() / 1000 + 6 * 24 * 60 * 60,
          totalMergeTime: 5 * 24 * 60 * 60, // 5 days base time
          mergeDuration: 6 * 24 * 60 * 60, // 6 days current time (slower)
        },
      });

      const result = generateWorlddrivenComment(
        pullRequestData,
        'testowner',
        'testrepo',
        123,
        []
      );

      assert.ok(result.includes('**Speed Factor:** 1.20'));
      assert.ok(result.includes('20% slower due to reviews'));
      assert.ok(
        result.includes('**Base Merge Time:** 5 days → **Current:** 6 days')
      );
    }
  );

  await t.test(
    'generateWorlddrivenComment should handle no change in timing',
    async () => {
      // Test case: No change in timing
      const pullRequestData = createSamplePullRequestData({
        times: {
          mergeDate: Date.now() / 1000 + 7 * 24 * 60 * 60,
          totalMergeTime: 7 * 24 * 60 * 60, // Same base and current time
          mergeDuration: 7 * 24 * 60 * 60,
        },
      });

      const result = generateWorlddrivenComment(
        pullRequestData,
        'testowner',
        'testrepo',
        123,
        []
      );

      assert.ok(result.includes('**Speed Factor:** 1.00'));
      assert.ok(result.includes('no change from reviews'));
    }
  );

  await t.test(
    'generateWorlddrivenComment should format dates correctly',
    async () => {
      const testDate = new Date('2025-09-24T14:30:45.123Z');
      const pullRequestData = createSamplePullRequestData({
        times: {
          mergeDate: testDate.getTime() / 1000,
        },
        dates: {
          max: testDate.getTime() - 24 * 60 * 60 * 1000, // 1 day before
        },
      });

      const result = generateWorlddrivenComment(
        pullRequestData,
        'testowner',
        'testrepo',
        123,
        []
      );

      assert.ok(result.includes('2025-09-24 at 14:30:45 UTC'));
      assert.ok(result.includes('2025-09-23 at 14:30:45 UTC'));
    }
  );

  await t.test(
    'generateWorlddrivenComment should limit activity log to 5 entries',
    async () => {
      const pullRequestData = createSamplePullRequestData();
      const activityLog = [
        { date: '2025-09-20, 10:00:00', message: 'Entry 1' },
        { date: '2025-09-21, 10:00:00', message: 'Entry 2' },
        { date: '2025-09-22, 10:00:00', message: 'Entry 3' },
        { date: '2025-09-23, 10:00:00', message: 'Entry 4' },
        { date: '2025-09-24, 10:00:00', message: 'Entry 5' },
        { date: '2025-09-24, 11:00:00', message: 'Entry 6' },
        { date: '2025-09-24, 12:00:00', message: 'Entry 7' },
      ];

      const result = generateWorlddrivenComment(
        pullRequestData,
        'testowner',
        'testrepo',
        123,
        activityLog
      );

      // Should show the last 5 entries (3, 4, 5, 6, 7)
      assert.ok(!result.includes('Entry 1'));
      assert.ok(!result.includes('Entry 2'));
      assert.ok(result.includes('Entry 3'));
      assert.ok(result.includes('Entry 4'));
      assert.ok(result.includes('Entry 5'));
      assert.ok(result.includes('Entry 6'));
      assert.ok(result.includes('Entry 7'));
    }
  );

  await t.test(
    'generateWorlddrivenComment should calculate agrees/disagrees correctly',
    async () => {
      const pullRequestData = createSamplePullRequestData({
        stats: {
          votes: 7, // 7 agrees
          votesTotal: 10, // 10 total contributors
          coefficient: 0.85,
        },
      });

      const result = generateWorlddrivenComment(
        pullRequestData,
        'testowner',
        'testrepo',
        123,
        []
      );

      assert.ok(
        result.includes('✅ **Positive votes:** 7/10 contribution weight')
      );
      // The format shows total votes as "7/10" not separate agrees/disagrees
      assert.ok(result.includes('coefficient: 0.85'));
    }
  );
});
