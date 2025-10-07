import { test } from 'node:test';
import assert from 'node:assert';
import sinon from 'sinon';

// Setup global fetch mock
global.fetch = sinon.stub();

test('Real-World PR Scenarios', async t => {
  let getPullRequestData;

  t.before(async () => {
    const pullRequestModule = await import('../src/helpers/pullRequest.js');
    getPullRequestData = pullRequestModule.getPullRequestData;
  });

  // ============================================================================
  // SCENARIO 1: worlddriven/documentation PR #2
  // This is the exact scenario that revealed our bugs
  // ============================================================================

  await t.test(
    'SCENARIO: worlddriven/documentation PR #2 (bug discovery case)',
    async () => {
      const mockGitHubClient = {
        getPullRequest: sinon.stub().resolves({
          id: 2,
          title:
            'feat: add organization repository management and drift detection',
          created_at: '2025-10-03T20:46:49Z',
          commits: 1,
          user: { login: 'TooAngel' },
          state: 'open',
          head: {
            repo: {
              // Fork has 2 commits (this is the bug scenario!)
              contributors_url:
                'https://api.github.com/repos/TooAngel/worlddriven-documentation/contributors',
              events_url:
                'https://api.github.com/repos/TooAngel/worlddriven-documentation/events',
            },
          },
          base: {
            repo: {
              // Base has only 1 commit per contributor
              contributors_url:
                'https://api.github.com/repos/worlddriven/documentation/contributors',
            },
          },
          commits_url:
            'https://api.github.com/repos/worlddriven/documentation/pulls/2/commits',
          issue_url:
            'https://api.github.com/repos/worlddriven/documentation/issues/2',
          _links: {
            self: {
              href: 'https://api.github.com/repos/worlddriven/documentation/pulls/2',
            },
          },
        }),

        // This simulates the actual contributors from the BASE repo (correct behavior)
        getContributors: sinon.stub().callsFake(url => {
          if (url.includes('worlddriven/documentation')) {
            // Correct: Base repo contributors
            return Promise.resolve([
              { name: 'TooAngel', commits: 1, reviewValue: 0, timeValue: '' },
              {
                name: 'worlddrivenbot',
                commits: 1,
                reviewValue: 0,
                timeValue: '',
              },
              {
                name: 'worlddriven[bot]',
                commits: 1,
                reviewValue: 0,
                timeValue: '',
              },
            ]);
          } else if (url.includes('TooAngel/worlddriven-documentation')) {
            // Bug: Fork has different counts
            return Promise.resolve([
              { name: 'TooAngel', commits: 2, reviewValue: 0, timeValue: '' }, // Wrong!
              {
                name: 'worlddrivenbot',
                commits: 1,
                reviewValue: 0,
                timeValue: '',
              },
              {
                name: 'worlddriven[bot]',
                commits: 1,
                reviewValue: 0,
                timeValue: '',
              },
            ]);
          }
          return Promise.resolve([]);
        }),

        getReviews: sinon.stub().resolves([]), // No reviews on PR #2

        getCommits: sinon.stub().resolves([
          {
            commit: {
              author: { date: '2025-10-03T20:37:54Z' },
              committer: { date: '2025-10-03T20:46:05Z' },
            },
          },
        ]),

        getBranchEvents: sinon.stub().resolves([]),
        getPullIssueEvents: sinon.stub().resolves([]),
        getRepository: sinon.stub().resolves({ default_branch: 'main' }),
        fetch: sinon.stub().resolves({ status: 404, ok: false }), // No custom config
      };

      const result = await getPullRequestData(
        mockGitHubClient,
        'worlddriven',
        'documentation',
        2
      );

      console.log('PR #2 Calculation Results:', {
        contributors: result.stats.contributors.map(c => ({
          name: c.name,
          commits: c.commits,
          timeValue: c.timeValue,
        })),
        votes: result.stats.votes,
        votesTotal: result.stats.votesTotal,
        coefficient: result.stats.coefficient,
        totalMergeTime: result.times.totalMergeTime / 86400,
        mergeDuration: result.times.mergeDuration / 86400,
        timeValueInDays: result.stats.contributors[0].timeValue / 86400,
      });

      // CORRECT BEHAVIOR (after our fixes):
      // Base repo: TooAngel(1), worlddrivenbot(1), worlddriven[bot](1) = 3 total
      // Only TooAngel votes (author): 1 × 1 = 1
      // Coefficient: 1/3 = 0.333...
      assert.strictEqual(
        result.stats.votesTotal,
        3,
        'Should use base repo: 3 total commits'
      );
      assert.strictEqual(result.stats.votes, 1, 'Only author votes: 1 commit');

      const expectedCoefficient = 1 / 3;
      assert.ok(
        Math.abs(result.stats.coefficient - expectedCoefficient) < 0.01,
        `Coefficient should be ~0.333, got ${result.stats.coefficient}`
      );

      // Base merge time: 10 days = 864000 seconds
      // Merge duration: (1 - 0.333) × 864000 = 0.667 × 864000 = 576000 seconds = 6.67 days
      const expectedMergeDuration = (1 - expectedCoefficient) * 864000;
      assert.ok(
        Math.abs(result.times.mergeDuration - expectedMergeDuration) < 100,
        `Merge duration should be ~${expectedMergeDuration} seconds (6.67 days), got ${result.times.mergeDuration}`
      );

      // TimeValue should be in SECONDS, not days
      const expectedTimeValue = 864000 / 3; // 288000 seconds = 3.33 days
      const authorContributor = result.stats.contributors.find(
        c => c.name === 'TooAngel'
      );
      assert.ok(
        Math.abs(authorContributor.timeValue - expectedTimeValue) < 1,
        `TimeValue should be ~288000 seconds (3.33 days), got ${authorContributor.timeValue}`
      );

      // Verify it's NOT the buggy value (432000 days)
      assert.ok(
        authorContributor.timeValue < 1000000,
        'TimeValue should NOT be in days (old bug)'
      );
    }
  );

  // ============================================================================
  // SCENARIO 2: Popular project with many contributors
  // ============================================================================

  await t.test(
    'SCENARIO: Popular open-source project with active reviews',
    async () => {
      const mockGitHubClient = {
        getPullRequest: sinon.stub().resolves({
          id: 100,
          title: 'feat: major new feature',
          created_at: '2025-01-01T00:00:00Z',
          commits: 5,
          user: { login: 'contributor' },
          head: { repo: { contributors_url: 'url', events_url: 'url' } },
          base: { repo: { contributors_url: 'url' } },
          commits_url: 'url',
          issue_url: 'url',
          _links: { self: { href: 'url' } },
        }),

        getContributors: sinon.stub().resolves([
          { name: 'maintainer1', commits: 500, reviewValue: 0, timeValue: '' },
          { name: 'maintainer2', commits: 300, reviewValue: 0, timeValue: '' },
          { name: 'contributor', commits: 50, reviewValue: 0, timeValue: '' },
          { name: 'contributor2', commits: 30, reviewValue: 0, timeValue: '' },
          { name: 'contributor3', commits: 20, reviewValue: 0, timeValue: '' },
        ]),

        getReviews: sinon.stub().resolves([
          { user: { login: 'maintainer1' }, state: 'APPROVED' },
          { user: { login: 'maintainer2' }, state: 'APPROVED' },
          { user: { login: 'contributor2' }, state: 'APPROVED' },
        ]),

        getCommits: sinon.stub().resolves([
          {
            commit: {
              author: { date: '2025-01-01T00:00:00Z' },
              committer: { date: '2025-01-01T00:00:00Z' },
            },
          },
        ]),
        getBranchEvents: sinon.stub().resolves([]),
        getPullIssueEvents: sinon.stub().resolves([]),
        getRepository: sinon.stub().resolves({ default_branch: 'main' }),
        fetch: sinon.stub().resolves({ status: 404, ok: false }),
      };

      const result = await getPullRequestData(
        mockGitHubClient,
        'owner',
        'repo',
        100
      );

      // Votes: contributor(50×1) + maintainer1(500×1) + maintainer2(300×1) + contributor2(30×1) = 880
      // Total: 900
      // Coefficient: 880/900 = 0.978
      const totalCommits = 500 + 300 + 50 + 30 + 20;
      const positiveVotes = 50 + 500 + 300 + 30;
      const expectedCoefficient = positiveVotes / totalCommits;

      assert.strictEqual(
        result.stats.votesTotal,
        totalCommits,
        'Total commits should be 900'
      );
      assert.strictEqual(
        result.stats.votes,
        positiveVotes,
        'Positive votes should be 880'
      );
      assert.ok(
        Math.abs(result.stats.coefficient - expectedCoefficient) < 0.001,
        `Coefficient should be ~0.978, got ${result.stats.coefficient}`
      );

      // With high coefficient, should merge very quickly
      // mergeDuration = (1 - 0.978) × 864000 = 0.022 × 864000 ≈ 19000 seconds ≈ 5.3 hours
      assert.ok(
        result.times.mergeDuration < 86400,
        'Should merge within 24 hours with strong approval'
      );
    }
  );

  // ============================================================================
  // SCENARIO 3: Controversial PR with split opinion
  // ============================================================================

  await t.test('SCENARIO: Controversial PR with split reviews', async () => {
    const mockGitHubClient = {
      getPullRequest: sinon.stub().resolves({
        id: 200,
        title: 'refactor: controversial breaking change',
        created_at: '2025-01-01T00:00:00Z',
        commits: 3,
        user: { login: 'rebel' },
        head: { repo: { contributors_url: 'url', events_url: 'url' } },
        base: { repo: { contributors_url: 'url' } },
        commits_url: 'url',
        issue_url: 'url',
        _links: { self: { href: 'url' } },
      }),

      getContributors: sinon.stub().resolves([
        { name: 'rebel', commits: 100, reviewValue: 0, timeValue: '' },
        { name: 'supporter1', commits: 80, reviewValue: 0, timeValue: '' },
        { name: 'supporter2', commits: 70, reviewValue: 0, timeValue: '' },
        { name: 'opposer1', commits: 90, reviewValue: 0, timeValue: '' },
        { name: 'opposer2', commits: 85, reviewValue: 0, timeValue: '' },
        { name: 'neutral', commits: 75, reviewValue: 0, timeValue: '' },
      ]),

      getReviews: sinon.stub().resolves([
        { user: { login: 'supporter1' }, state: 'APPROVED' },
        { user: { login: 'supporter2' }, state: 'APPROVED' },
        { user: { login: 'opposer1' }, state: 'CHANGES_REQUESTED' },
        { user: { login: 'opposer2' }, state: 'CHANGES_REQUESTED' },
        // neutral doesn't review
      ]),

      getCommits: sinon.stub().resolves([
        {
          commit: {
            author: { date: '2025-01-01T00:00:00Z' },
            committer: { date: '2025-01-01T00:00:00Z' },
          },
        },
      ]),
      getBranchEvents: sinon.stub().resolves([]),
      getPullIssueEvents: sinon.stub().resolves([]),
      getRepository: sinon.stub().resolves({ default_branch: 'main' }),
      fetch: sinon.stub().resolves({ status: 404, ok: false }),
    };

    const result = await getPullRequestData(
      mockGitHubClient,
      'owner',
      'repo',
      200
    );

    // Votes: rebel(100×1) + supporter1(80×1) + supporter2(70×1) + opposer1(90×-1) + opposer2(85×-1)
    // = 100 + 80 + 70 - 90 - 85 = 75
    // Total: 500
    // Coefficient: 75/500 = 0.15
    const positiveVotes = 100 + 80 + 70;
    const negativeVotes = 90 + 85;
    const netVotes = positiveVotes - negativeVotes;
    const totalCommits = 100 + 80 + 70 + 90 + 85 + 75;

    assert.strictEqual(
      result.stats.votes,
      netVotes,
      'Net votes should account for blocking'
    );
    assert.strictEqual(result.stats.votesTotal, totalCommits);

    const expectedCoefficient = netVotes / totalCommits;
    assert.ok(
      Math.abs(result.stats.coefficient - expectedCoefficient) < 0.01,
      `Coefficient should be ~${expectedCoefficient}, got ${result.stats.coefficient}`
    );

    // Low coefficient means long merge time
    // mergeDuration = (1 - 0.15) × 864000 = 0.85 × 864000 = 734400 seconds ≈ 8.5 days
    const expectedMergeDuration = (1 - expectedCoefficient) * 864000;
    assert.ok(
      Math.abs(result.times.mergeDuration - expectedMergeDuration) < 1000,
      'Controversial PR should have extended merge time'
    );
  });

  // ============================================================================
  // SCENARIO 4: First-time contributor to established project
  // ============================================================================

  await t.test('SCENARIO: First-time contributor with small fix', async () => {
    const mockGitHubClient = {
      getPullRequest: sinon.stub().resolves({
        id: 300,
        title: 'fix: typo in documentation',
        created_at: '2025-01-01T00:00:00Z',
        commits: 1,
        user: { login: 'newbie' },
        head: { repo: { contributors_url: 'url', events_url: 'url' } },
        base: { repo: { contributors_url: 'url' } },
        commits_url: 'url',
        issue_url: 'url',
        _links: { self: { href: 'url' } },
      }),

      getContributors: sinon.stub().resolves([
        { name: 'maintainer', commits: 1000, reviewValue: 0, timeValue: '' },
        { name: 'regular1', commits: 200, reviewValue: 0, timeValue: '' },
        { name: 'regular2', commits: 150, reviewValue: 0, timeValue: '' },
        { name: 'newbie', commits: 1, reviewValue: 0, timeValue: '' }, // First PR!
      ]),

      getReviews: sinon
        .stub()
        .resolves([{ user: { login: 'maintainer' }, state: 'APPROVED' }]),

      getCommits: sinon.stub().resolves([
        {
          commit: {
            author: { date: '2025-01-01T00:00:00Z' },
            committer: { date: '2025-01-01T00:00:00Z' },
          },
        },
      ]),
      getBranchEvents: sinon.stub().resolves([]),
      getPullIssueEvents: sinon.stub().resolves([]),
      getRepository: sinon.stub().resolves({ default_branch: 'main' }),
      fetch: sinon.stub().resolves({ status: 404, ok: false }),
    };

    const result = await getPullRequestData(
      mockGitHubClient,
      'owner',
      'repo',
      300
    );

    // Votes: newbie(1×1) + maintainer(1000×1) = 1001
    // Total: 1351
    // Coefficient: 1001/1351 = 0.741
    const totalCommits = 1000 + 200 + 150 + 1;
    const positiveVotes = 1 + 1000;
    const expectedCoefficient = positiveVotes / totalCommits;

    assert.strictEqual(result.stats.votes, positiveVotes);
    assert.ok(
      Math.abs(result.stats.coefficient - expectedCoefficient) < 0.01,
      'Newbie with maintainer approval should get decent coefficient'
    );

    // Newbie has very small timeValue (1/1351 of total)
    const newbieContributor = result.stats.contributors.find(
      c => c.name === 'newbie'
    );
    const expectedTimeValue = (1 / totalCommits) * 864000;
    assert.ok(
      Math.abs(newbieContributor.timeValue - expectedTimeValue) < 1,
      'Newbie should have proportional timeValue based on 1 commit'
    );
  });

  // ============================================================================
  // SCENARIO 5: PR with custom repository config
  // ============================================================================

  await t.test('SCENARIO: PR with custom .worlddriven.ini config', async () => {
    const customConfig = `
[DEFAULT]
baseMergeTimeInHours = 48
perCommitTimeInHours = 12
merge_method = rebase
`;
    const base64Content = Buffer.from(customConfig).toString('base64');

    const mockGitHubClient = {
      getPullRequest: sinon.stub().resolves({
        id: 400,
        title: 'feat: urgent hotfix',
        created_at: '2025-01-01T00:00:00Z',
        commits: 2,
        user: { login: 'developer' },
        head: { repo: { contributors_url: 'url', events_url: 'url' } },
        base: { repo: { contributors_url: 'url' } },
        commits_url: 'url',
        issue_url: 'url',
        _links: { self: { href: 'url' } },
      }),

      getContributors: sinon.stub().resolves([
        { name: 'developer', commits: 50, reviewValue: 0, timeValue: '' },
        { name: 'reviewer', commits: 50, reviewValue: 0, timeValue: '' },
      ]),

      getReviews: sinon
        .stub()
        .resolves([{ user: { login: 'reviewer' }, state: 'APPROVED' }]),

      getCommits: sinon.stub().resolves([
        {
          commit: {
            author: { date: '2025-01-01T00:00:00Z' },
            committer: { date: '2025-01-01T00:00:00Z' },
          },
        },
      ]),
      getBranchEvents: sinon.stub().resolves([]),
      getPullIssueEvents: sinon.stub().resolves([]),
      getRepository: sinon.stub().resolves({ default_branch: 'main' }),
      fetch: sinon.stub().resolves({
        status: 200,
        ok: true,
        json: async () => ({ content: base64Content }),
      }),
    };

    const result = await getPullRequestData(
      mockGitHubClient,
      'owner',
      'repo',
      400
    );

    // Custom config: 48 hours base + 2 commits × 12 hours = 48 + 24 = 72 hours = 3 days
    const expectedTotalMergeTime = (48 + 2 * 12) * 3600; // 72 hours in seconds = 259200
    assert.strictEqual(
      result.times.totalMergeTime,
      expectedTotalMergeTime,
      'Should use custom config for merge time'
    );

    // Verify config was applied
    assert.strictEqual(result.config.baseMergeTimeInHours, 48);
    assert.strictEqual(result.config.perCommitTimeInHours, 12);
    assert.strictEqual(result.config.merge_method, 'rebase');

    // With full approval (coefficient 1.0), should merge immediately
    assert.strictEqual(
      result.times.mergeDuration,
      0,
      'Full approval = immediate merge'
    );
  });
});
