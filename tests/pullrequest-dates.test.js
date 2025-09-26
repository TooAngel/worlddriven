import { test } from 'node:test';
import assert from 'node:assert';
import sinon from 'sinon';

// Setup global fetch mock
global.fetch = sinon.stub();

test('Pull request date calculation', async t => {
  let getPullRequestData;

  t.before(async () => {
    // Mock the fetch to return controlled data
    global.fetch.callsFake(async (url, _options) => {
      if (url.includes('/reviews')) {
        return {
          ok: true,
          json: async () => [],
        };
      }

      if (url.includes('/commits')) {
        return {
          ok: true,
          json: async () => [
            {
              commit: {
                author: { date: '2025-09-24T06:02:48Z' },
                committer: { date: '2025-09-25T19:11:10Z' }, // Force push date
              },
            },
          ],
        };
      }

      if (url.includes('/pulls/123')) {
        // Mock PR data
        return {
          ok: true,
          json: async () => ({
            id: 123,
            title: 'Test PR',
            created_at: '2025-09-24T06:03:07Z',
            commits: 1,
            user: { login: 'testuser' },
            head: {
              repo: {
                contributors_url:
                  'https://api.github.com/repos/test/repo/contributors',
                events_url: 'https://api.github.com/repos/test/repo/events',
              },
            },
            commits_url:
              'https://api.github.com/repos/test/repo/pulls/123/commits',
            issue_url: 'https://api.github.com/repos/test/repo/issues/123',
            _links: {
              self: {
                href: 'https://api.github.com/repos/test/repo/pulls/123',
              },
            },
          }),
        };
      }

      if (url.includes('/contributors')) {
        return {
          ok: true,
          json: async () => [{ login: 'testuser', contributions: 10 }],
        };
      }

      if (url.includes('/events')) {
        return {
          ok: true,
          json: async () => [
            {
              type: 'PushEvent',
              created_at: '2025-09-25T19:11:10Z', // Force push event
            },
          ],
        };
      }

      if (url.includes('/issues/123/events')) {
        return {
          ok: true,
          json: async () => [],
        };
      }

      // For any other URL, return empty array to be safe
      return { ok: true, json: async () => [] };
    });

    const pullRequestModule = await import('../src/helpers/pullRequest.js');
    getPullRequestData = pullRequestModule.getPullRequestData;
  });

  await t.test('should use latest commit/push date as start date', async () => {
    const user = { githubAccessToken: 'test-token' };
    const result = await getPullRequestData(user, 'test', 'repo', 123);

    // The max date should be the force push date (latest)
    const expectedMaxDate = new Date('2025-09-25T19:11:10Z').getTime();

    console.log('Result dates:', {
      created: new Date(result.dates.created).toISOString(),
      commit: new Date(result.dates.commit).toISOString(),
      push: new Date(result.dates.push).toISOString(),
      max: new Date(result.dates.max).toISOString(),
    });

    console.log('Merge calculation:', {
      baseMergeTime: result.times.totalMergeTime / (24 * 60 * 60), // in days
      coefficient: result.stats.coefficient,
      adjustedTime: result.times.mergeDuration / (24 * 60 * 60), // in days
      mergeDate: new Date(result.times.mergeDate * 1000).toISOString(),
    });

    // Test the max date is the force push date
    assert.strictEqual(
      result.dates.max,
      expectedMaxDate,
      `Expected max date to be force push date ${new Date(expectedMaxDate).toISOString()}, got ${new Date(result.dates.max).toISOString()}`
    );
  });

  await t.test(
    'should calculate merge date from latest push/commit date',
    async () => {
      const user = { githubAccessToken: 'test-token' };
      const result = await getPullRequestData(user, 'test', 'repo', 123);

      // With coefficient 1.0 (perfect approval) and ~10 days base time
      // mergeDuration should be 0, so merge should be immediate
      // With no reviews (coefficient 0), merge should be after full duration

      const baseMergeTimeHours = 240; // 10 days
      const baseMergeTimeSeconds = baseMergeTimeHours * 60 * 60;
      const coefficient = result.stats.coefficient; // Should be 1.0 for PR author
      const expectedMergeDuration = (1 - coefficient) * baseMergeTimeSeconds;
      const startDate = new Date('2025-09-25T19:11:10Z').getTime();
      const expectedMergeDate =
        (startDate + expectedMergeDuration * 1000) / 1000;

      console.log('Expected merge calculation:', {
        coefficient,
        baseMergeTimeHours,
        expectedMergeDuration: expectedMergeDuration / (24 * 60 * 60),
        startDate: new Date(startDate).toISOString(),
        expectedMergeDate: new Date(expectedMergeDate * 1000).toISOString(),
        actualMergeDate: new Date(result.times.mergeDate * 1000).toISOString(),
      });

      // The merge date should be calculated from the force push date
      assert.strictEqual(
        Math.floor(result.times.mergeDate),
        Math.floor(expectedMergeDate),
        'Merge date should be calculated from the latest push/commit date'
      );
    }
  );
});
