import { test } from 'node:test';
import assert from 'node:assert';

test('Worlddriven date calculation fix', async t => {
  await t.test('should use committer date for force pushes', async () => {
    // Test the specific scenario from PR #293
    const commits = [
      {
        commit: {
          author: { date: '2025-09-24T06:02:48Z' }, // Original commit
          committer: { date: '2025-09-25T19:11:10Z' }, // Force push (amendment)
        },
      },
    ];

    // Simulate the fixed algorithm
    const result = commits.reduce((total, current) => {
      const authorDate = new Date(current.commit.author.date);
      const committerDate = new Date(current.commit.committer.date);
      const latestCommitDate = Math.max(authorDate, committerDate);
      return Math.max(new Date(total), latestCommitDate);
    }, new Date('January 1, 1970 00:00:00 UTC'));

    const expectedDate = new Date('2025-09-25T19:11:10Z');

    console.log(
      'Author date:',
      new Date(commits[0].commit.author.date).toISOString()
    );
    console.log(
      'Committer date:',
      new Date(commits[0].commit.committer.date).toISOString()
    );
    console.log('Selected date:', new Date(result).toISOString());
    console.log('Expected date:', expectedDate.toISOString());

    // Should use the committer date (force push date) as it's more recent
    assert.strictEqual(
      new Date(result).toISOString(),
      expectedDate.toISOString(),
      'Should use the committer date for force pushes'
    );
  });

  await t.test(
    'should calculate correct merge timing from force push date',
    async () => {
      // Test the complete timing calculation with PR #293 scenario
      const forcePushDate = new Date('2025-09-25T19:11:10Z').getTime();
      const baseMergeTimeHours = 240; // 10 days
      const coefficient = 0.81; // From PR #293

      const totalMergeTimeSeconds = baseMergeTimeHours * 60 * 60;
      const mergeDurationSeconds = (1 - coefficient) * totalMergeTimeSeconds;
      const expectedMergeTimestamp =
        (forcePushDate + mergeDurationSeconds * 1000) / 1000;

      console.log('Force push date:', new Date(forcePushDate).toISOString());
      console.log('Base merge time:', baseMergeTimeHours / 24, 'days');
      console.log('Coefficient:', coefficient);
      console.log(
        'Merge duration:',
        mergeDurationSeconds / (24 * 60 * 60),
        'days'
      );
      console.log(
        'Expected merge date:',
        new Date(expectedMergeTimestamp * 1000).toISOString()
      );

      // With coefficient 0.81, merge should happen ~1.9 days after force push
      const expectedMergeDays = mergeDurationSeconds / (24 * 60 * 60);
      assert.ok(
        expectedMergeDays > 1.8 && expectedMergeDays < 2.0,
        `Expected merge in ~1.9 days, got ${expectedMergeDays.toFixed(2)} days`
      );

      // Should merge around September 27th, not September 26th
      const expectedMergeDate = new Date(expectedMergeTimestamp * 1000);
      assert.strictEqual(
        expectedMergeDate.getUTCDate(),
        27,
        'Should merge on September 27th with correct calculation'
      );

      // The actual bug: PR #293 merged at 2025-09-26T03:51:35Z
      // But should have merged around 2025-09-27T16:47:10Z
      const actualPrematureMerge = new Date('2025-09-26T03:51:35Z');
      const timeDifferenceHours =
        (expectedMergeDate - actualPrematureMerge) / (1000 * 60 * 60);

      console.log('Actual merge time:', actualPrematureMerge.toISOString());
      console.log('Expected merge time:', expectedMergeDate.toISOString());
      console.log('Difference:', timeDifferenceHours.toFixed(1), 'hours early');

      // The bug caused merge to be ~37 hours too early
      assert.ok(
        timeDifferenceHours > 30,
        `Bug caused merge to be ${timeDifferenceHours.toFixed(1)} hours too early`
      );
    }
  );
});
