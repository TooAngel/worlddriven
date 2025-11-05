import { test } from 'node:test';
import assert from 'node:assert';
import sinon from 'sinon';

// Setup global fetch mock
global.fetch = sinon.stub();

test('Core Calculation Logic - Voting and Time Metrics', async t => {
  let getPullRequestData;

  t.before(async () => {
    const pullRequestModule = await import('../src/helpers/pullRequest.js');
    getPullRequestData = pullRequestModule.getPullRequestData;
  });

  // ============================================================================
  // VOTING CALCULATION TESTS
  // ============================================================================

  await t.test('PR author gets automatic positive vote', async () => {
    const mockGitHubClient = {
      getPullRequest: sinon.stub().resolves({
        id: 1,
        title: 'Test PR',
        created_at: '2025-01-01T00:00:00Z',
        commits: 1,
        user: { login: 'author' },
        head: {
          repo: { contributors_url: 'url', events_url: 'url' },
        },
        base: {
          repo: { contributors_url: 'url' },
        },
        commits_url: 'url',
        issue_url: 'url',
        _links: { self: { href: 'url' } },
      }),
      getContributors: sinon.stub().resolves([
        { name: 'author', commits: 5, reviewValue: 0, timeValue: '' },
        { name: 'other', commits: 5, reviewValue: 0, timeValue: '' },
      ]),
      getReviews: sinon.stub().resolves([]), // No reviews
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
    };

    const result = await getPullRequestData(
      mockGitHubClient,
      'owner',
      'repo',
      1
    );

    // PR author should get positive vote even without reviews
    assert.strictEqual(
      result.stats.votes,
      5,
      'Author should have 5 votes (5 commits × 1)'
    );
    assert.strictEqual(
      result.stats.votesTotal,
      10,
      'Total should be 10 commits'
    );
    assert.strictEqual(
      result.stats.coefficient,
      0.5,
      'Coefficient should be 5/10 = 0.5'
    );
  });

  await t.test('APPROVED review adds positive vote', async () => {
    const mockGitHubClient = {
      getPullRequest: sinon.stub().resolves({
        id: 1,
        title: 'Test PR',
        created_at: '2025-01-01T00:00:00Z',
        commits: 1,
        user: { login: 'author' },
        head: { repo: { contributors_url: 'url', events_url: 'url' } },
        base: { repo: { contributors_url: 'url' } },
        commits_url: 'url',
        issue_url: 'url',
        _links: { self: { href: 'url' } },
      }),
      getContributors: sinon.stub().resolves([
        { name: 'author', commits: 3, reviewValue: 0, timeValue: '' },
        { name: 'reviewer', commits: 7, reviewValue: 0, timeValue: '' },
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
    };

    const result = await getPullRequestData(
      mockGitHubClient,
      'owner',
      'repo',
      1
    );

    // Author: 3 × 1 = 3, Reviewer: 7 × 1 = 7, Total = 10
    assert.strictEqual(result.stats.votes, 10, 'Should have 10 positive votes');
    assert.strictEqual(result.stats.votesTotal, 10, 'Total should be 10');
    assert.strictEqual(
      result.stats.coefficient,
      1.0,
      'All positive votes = coefficient 1.0'
    );
  });

  await t.test('CHANGES_REQUESTED review adds negative vote', async () => {
    const mockGitHubClient = {
      getPullRequest: sinon.stub().resolves({
        id: 1,
        title: 'Test PR',
        created_at: '2025-01-01T00:00:00Z',
        commits: 1,
        user: { login: 'author' },
        head: { repo: { contributors_url: 'url', events_url: 'url' } },
        base: { repo: { contributors_url: 'url' } },
        commits_url: 'url',
        issue_url: 'url',
        _links: { self: { href: 'url' } },
      }),
      getContributors: sinon.stub().resolves([
        { name: 'author', commits: 5, reviewValue: 0, timeValue: '' },
        { name: 'reviewer', commits: 5, reviewValue: 0, timeValue: '' },
      ]),
      getReviews: sinon
        .stub()
        .resolves([
          { user: { login: 'reviewer' }, state: 'CHANGES_REQUESTED' },
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
    };

    const result = await getPullRequestData(
      mockGitHubClient,
      'owner',
      'repo',
      1
    );

    // Author: 5 × 1 = 5, Reviewer: 5 × -1 = -5, Net = 0
    assert.strictEqual(
      result.stats.votes,
      0,
      'Should have 0 net votes (5 + -5)'
    );
    assert.strictEqual(result.stats.votesTotal, 10, 'Total should be 10');
    assert.strictEqual(
      result.stats.coefficient,
      0,
      'Balanced votes = coefficient 0'
    );
  });

  await t.test('Mixed reviews calculate correctly', async () => {
    const mockGitHubClient = {
      getPullRequest: sinon.stub().resolves({
        id: 1,
        title: 'Test PR',
        created_at: '2025-01-01T00:00:00Z',
        commits: 1,
        user: { login: 'author' },
        head: { repo: { contributors_url: 'url', events_url: 'url' } },
        base: { repo: { contributors_url: 'url' } },
        commits_url: 'url',
        issue_url: 'url',
        _links: { self: { href: 'url' } },
      }),
      getContributors: sinon.stub().resolves([
        { name: 'author', commits: 10, reviewValue: 0, timeValue: '' },
        { name: 'approver1', commits: 10, reviewValue: 0, timeValue: '' },
        { name: 'approver2', commits: 5, reviewValue: 0, timeValue: '' },
        { name: 'blocker', commits: 15, reviewValue: 0, timeValue: '' },
      ]),
      getReviews: sinon.stub().resolves([
        { user: { login: 'approver1' }, state: 'APPROVED' },
        { user: { login: 'approver2' }, state: 'APPROVED' },
        { user: { login: 'blocker' }, state: 'CHANGES_REQUESTED' },
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
    };

    const result = await getPullRequestData(
      mockGitHubClient,
      'owner',
      'repo',
      1
    );

    // Author: 10×1=10, Approver1: 10×1=10, Approver2: 5×1=5, Blocker: 15×-1=-15
    // Total votes: 10 + 10 + 5 - 15 = 10
    // Total commits: 40
    // Coefficient: 10/40 = 0.25
    assert.strictEqual(result.stats.votes, 10, 'Net votes should be 10');
    assert.strictEqual(
      result.stats.votesTotal,
      40,
      'Total commits should be 40'
    );
    assert.strictEqual(
      result.stats.coefficient,
      0.25,
      'Coefficient should be 10/40 = 0.25'
    );
  });

  await t.test('Contributors weighted by commit count', async () => {
    const mockGitHubClient = {
      getPullRequest: sinon.stub().resolves({
        id: 1,
        title: 'Test PR',
        created_at: '2025-01-01T00:00:00Z',
        commits: 1,
        user: { login: 'author' },
        head: { repo: { contributors_url: 'url', events_url: 'url' } },
        base: { repo: { contributors_url: 'url' } },
        commits_url: 'url',
        issue_url: 'url',
        _links: { self: { href: 'url' } },
      }),
      getContributors: sinon.stub().resolves([
        { name: 'author', commits: 1, reviewValue: 0, timeValue: '' },
        { name: 'major', commits: 99, reviewValue: 0, timeValue: '' },
      ]),
      getReviews: sinon
        .stub()
        .resolves([{ user: { login: 'major' }, state: 'APPROVED' }]),
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
    };

    const result = await getPullRequestData(
      mockGitHubClient,
      'owner',
      'repo',
      1
    );

    // Author: 1×1=1, Major: 99×1=99, Total: 100
    assert.strictEqual(result.stats.votes, 100, 'Should weight by commits');
    assert.strictEqual(result.stats.coefficient, 1.0, 'Both approved = 1.0');
  });

  // ============================================================================
  // TIME METRICS CALCULATION TESTS
  // ============================================================================

  await t.test(
    'totalMergeTime calculated correctly with base time',
    async () => {
      const mockGitHubClient = {
        getPullRequest: sinon.stub().resolves({
          id: 1,
          title: 'Test PR',
          created_at: '2025-01-01T00:00:00Z',
          commits: 5,
          user: { login: 'author' },
          head: { repo: { contributors_url: 'url', events_url: 'url' } },
          base: { repo: { contributors_url: 'url' } },
          commits_url: 'url',
          issue_url: 'url',
          _links: { self: { href: 'url' } },
        }),
        getContributors: sinon
          .stub()
          .resolves([
            { name: 'author', commits: 10, reviewValue: 0, timeValue: '' },
          ]),
        getReviews: sinon.stub().resolves([]),
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
        fetch: sinon.stub().resolves({ status: 404, ok: false }), // No config
      };

      const result = await getPullRequestData(
        mockGitHubClient,
        'owner',
        'repo',
        1
      );

      // Default config: 240 hours base, 0 per commit
      // totalMergeTime = (240/24 + 5×0/24) × 24 × 60 × 60 = 10 days = 864000 seconds
      assert.strictEqual(
        result.times.totalMergeTime,
        864000,
        'Should be 10 days in seconds with default config'
      );
    }
  );

  await t.test('totalMergeTime includes perCommitTime', async () => {
    const iniContent = `
[DEFAULT]
baseMergeTimeInHours = 24
perCommitTimeInHours = 24
`;
    const base64Content = Buffer.from(iniContent).toString('base64');

    const mockGitHubClient = {
      getPullRequest: sinon.stub().resolves({
        id: 1,
        title: 'Test PR',
        created_at: '2025-01-01T00:00:00Z',
        commits: 3,
        user: { login: 'author' },
        head: { repo: { contributors_url: 'url', events_url: 'url' } },
        base: { repo: { contributors_url: 'url' } },
        commits_url: 'url',
        issue_url: 'url',
        _links: { self: { href: 'url' } },
      }),
      getContributors: sinon
        .stub()
        .resolves([
          { name: 'author', commits: 10, reviewValue: 0, timeValue: '' },
        ]),
      getReviews: sinon.stub().resolves([]),
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
      1
    );

    // totalMergeTime = (24/24 + 3×24/24) × 24 × 60 × 60 = (1 + 3) × 86400 = 345600 seconds = 4 days
    assert.strictEqual(
      result.times.totalMergeTime,
      345600,
      'Should be 4 days (1 base + 3 commits)'
    );
  });

  await t.test('mergeDuration reduced by coefficient', async () => {
    const mockGitHubClient = {
      getPullRequest: sinon.stub().resolves({
        id: 1,
        title: 'Test PR',
        created_at: '2025-01-01T00:00:00Z',
        commits: 1,
        user: { login: 'author' },
        head: { repo: { contributors_url: 'url', events_url: 'url' } },
        base: { repo: { contributors_url: 'url' } },
        commits_url: 'url',
        issue_url: 'url',
        _links: { self: { href: 'url' } },
      }),
      getContributors: sinon.stub().resolves([
        { name: 'author', commits: 5, reviewValue: 0, timeValue: '' },
        { name: 'approver', commits: 5, reviewValue: 0, timeValue: '' },
      ]),
      getReviews: sinon
        .stub()
        .resolves([{ user: { login: 'approver' }, state: 'APPROVED' }]),
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
      1
    );

    // Coefficient = 1.0 (all approve)
    // mergeDuration = (1 - 1.0) × 864000 = 0
    assert.strictEqual(
      result.stats.coefficient,
      1.0,
      'Should have coefficient 1.0'
    );
    assert.strictEqual(
      result.times.mergeDuration,
      0,
      'Should merge immediately with full approval'
    );
  });

  await t.test(
    'timeValue calculated in seconds (regression test)',
    async () => {
      const mockGitHubClient = {
        getPullRequest: sinon.stub().resolves({
          id: 1,
          title: 'Test PR',
          created_at: '2025-01-01T00:00:00Z',
          commits: 1,
          user: { login: 'author' },
          head: { repo: { contributors_url: 'url', events_url: 'url' } },
          base: { repo: { contributors_url: 'url' } },
          commits_url: 'url',
          issue_url: 'url',
          _links: { self: { href: 'url' } },
        }),
        getContributors: sinon.stub().resolves([
          { name: 'author', commits: 1, reviewValue: 0, timeValue: '' },
          { name: 'other1', commits: 1, reviewValue: 0, timeValue: '' },
          { name: 'other2', commits: 1, reviewValue: 0, timeValue: '' },
        ]),
        getReviews: sinon.stub().resolves([]),
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
        1
      );

      // totalMergeTime = 864000 seconds (10 days)
      // Each contributor: 1/3 of total = 288000 seconds = 3.33 days
      const expectedTimeValue = 864000 / 3;

      // Find author in contributors
      const authorContributor = result.stats.contributors.find(
        c => c.name === 'author'
      );

      // CRITICAL: timeValue should be in SECONDS, not days!
      assert.strictEqual(
        authorContributor.timeValue,
        expectedTimeValue,
        'timeValue should be in seconds (288000 = 3.33 days)'
      );

      // Verify it's NOT in days (would be 432000 days with old bug)
      assert.ok(
        authorContributor.timeValue < 1000000,
        'timeValue should NOT be in days (old bug multiplied by 86400)'
      );
    }
  );

  await t.test('timeValue sum equals totalMergeTime', async () => {
    const mockGitHubClient = {
      getPullRequest: sinon.stub().resolves({
        id: 1,
        title: 'Test PR',
        created_at: '2025-01-01T00:00:00Z',
        commits: 1,
        user: { login: 'author' },
        head: { repo: { contributors_url: 'url', events_url: 'url' } },
        base: { repo: { contributors_url: 'url' } },
        commits_url: 'url',
        issue_url: 'url',
        _links: { self: { href: 'url' } },
      }),
      getContributors: sinon.stub().resolves([
        { name: 'author', commits: 2, reviewValue: 0, timeValue: '' },
        { name: 'other1', commits: 3, reviewValue: 0, timeValue: '' },
        { name: 'other2', commits: 5, reviewValue: 0, timeValue: '' },
      ]),
      getReviews: sinon.stub().resolves([]),
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
      1
    );

    const totalTimeValue = result.stats.contributors.reduce(
      (sum, c) => sum + c.timeValue,
      0
    );

    // Sum of all timeValues should equal totalMergeTime
    assert.strictEqual(
      Math.round(totalTimeValue),
      Math.round(result.times.totalMergeTime),
      'Sum of contributor timeValues should equal totalMergeTime'
    );
  });

  // ============================================================================
  // REGRESSION TESTS FOR BUGS WE FIXED
  // ============================================================================

  await t.test(
    'REGRESSION: Uses base repo contributors, not head repo',
    async () => {
      let baseContributorsRequested = false;
      let headContributorsRequested = false;

      const mockGitHubClient = {
        getPullRequest: sinon.stub().resolves({
          id: 1,
          title: 'Test PR',
          created_at: '2025-01-01T00:00:00Z',
          commits: 1,
          user: { login: 'author' },
          head: {
            repo: {
              contributors_url:
                'https://api.github.com/repos/fork/repo/contributors',
              events_url: 'url',
            },
          },
          base: {
            repo: {
              contributors_url:
                'https://api.github.com/repos/base/repo/contributors',
            },
          },
          commits_url: 'url',
          issue_url: 'url',
          _links: { self: { href: 'url' } },
        }),
        getContributors: sinon.stub().callsFake(url => {
          if (url.includes('base/repo')) {
            baseContributorsRequested = true;
            return Promise.resolve([
              { name: 'author', commits: 1, reviewValue: 0, timeValue: '' },
            ]);
          }
          if (url.includes('fork/repo')) {
            headContributorsRequested = true;
            return Promise.resolve([
              { name: 'author', commits: 2, reviewValue: 0, timeValue: '' },
            ]);
          }
          return Promise.resolve([]);
        }),
        getReviews: sinon.stub().resolves([]),
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
        1
      );

      // CRITICAL: Should request base repo, NOT head repo
      assert.ok(
        baseContributorsRequested,
        'Should request BASE repo contributors'
      );
      assert.ok(
        !headContributorsRequested,
        'Should NOT request HEAD (fork) repo contributors'
      );

      // Should use base repo contributor count (1 commit, not 2)
      assert.strictEqual(
        result.stats.votesTotal,
        1,
        'Should use base repo commit count'
      );
    }
  );

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  await t.test('EDGE CASE: Single contributor, no reviews', async () => {
    const mockGitHubClient = {
      getPullRequest: sinon.stub().resolves({
        id: 1,
        title: 'Test PR',
        created_at: '2025-01-01T00:00:00Z',
        commits: 1,
        user: { login: 'solo' },
        head: { repo: { contributors_url: 'url', events_url: 'url' } },
        base: { repo: { contributors_url: 'url' } },
        commits_url: 'url',
        issue_url: 'url',
        _links: { self: { href: 'url' } },
      }),
      getContributors: sinon
        .stub()
        .resolves([
          { name: 'solo', commits: 100, reviewValue: 0, timeValue: '' },
        ]),
      getReviews: sinon.stub().resolves([]),
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
      1
    );

    // Solo author gets automatic approval
    assert.strictEqual(
      result.stats.coefficient,
      1.0,
      'Solo author should have coefficient 1.0'
    );
    assert.strictEqual(
      result.times.mergeDuration,
      0,
      'Should merge immediately'
    );
  });

  await t.test('EDGE CASE: All negative reviews', async () => {
    const mockGitHubClient = {
      getPullRequest: sinon.stub().resolves({
        id: 1,
        title: 'Test PR',
        created_at: '2025-01-01T00:00:00Z',
        commits: 1,
        user: { login: 'author' },
        head: { repo: { contributors_url: 'url', events_url: 'url' } },
        base: { repo: { contributors_url: 'url' } },
        commits_url: 'url',
        issue_url: 'url',
        _links: { self: { href: 'url' } },
      }),
      getContributors: sinon.stub().resolves([
        { name: 'author', commits: 1, reviewValue: 0, timeValue: '' },
        { name: 'blocker1', commits: 10, reviewValue: 0, timeValue: '' },
        { name: 'blocker2', commits: 10, reviewValue: 0, timeValue: '' },
      ]),
      getReviews: sinon.stub().resolves([
        { user: { login: 'blocker1' }, state: 'CHANGES_REQUESTED' },
        { user: { login: 'blocker2' }, state: 'CHANGES_REQUESTED' },
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
      1
    );

    // Author: 1×1=1, Blocker1: 10×-1=-10, Blocker2: 10×-1=-10
    // Net: 1 - 10 - 10 = -19
    // Coefficient: -19/21 = -0.905...
    assert.ok(
      result.stats.coefficient < 0,
      'Coefficient should be negative with majority blocking'
    );

    // With negative coefficient, should use close path
    assert.strictEqual(result.times.action, 'close', 'Should use close action');
    assert.ok(
      result.times.daysToClose !== undefined,
      'Should have daysToClose property'
    );
  });

  // ============================================================================
  // AUTO-CLOSE CALCULATION TESTS
  // ============================================================================

  await t.test(
    'Auto-close: Negative coefficient triggers close path',
    async () => {
      const mockGitHubClient = {
        getPullRequest: sinon.stub().resolves({
          id: 1,
          title: 'Test PR',
          created_at: '2025-01-01T00:00:00Z',
          commits: 1,
          user: { login: 'author' },
          head: { repo: { contributors_url: 'url', events_url: 'url' } },
          base: { repo: { contributors_url: 'url' } },
          commits_url: 'url',
          issue_url: 'url',
          _links: { self: { href: 'url' } },
        }),
        getContributors: sinon.stub().resolves([
          { name: 'author', commits: 1, reviewValue: 0, timeValue: '' },
          { name: 'blocker', commits: 2, reviewValue: 0, timeValue: '' },
        ]),
        getReviews: sinon
          .stub()
          .resolves([
            { user: { login: 'blocker' }, state: 'CHANGES_REQUESTED' },
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
        1
      );

      // Coefficient = (1 - 2) / 3 = -1/3 = -0.333...
      assert.ok(
        result.stats.coefficient < 0,
        'Should have negative coefficient'
      );
      assert.strictEqual(
        result.times.action,
        'close',
        'Should use close action'
      );
      assert.ok(result.times.closeDate !== undefined, 'Should have closeDate');
      assert.ok(
        result.times.closeDuration !== undefined,
        'Should have closeDuration'
      );
    }
  );

  await t.test(
    'Auto-close: Base close time is 100 days (default)',
    async () => {
      const mockGitHubClient = {
        getPullRequest: sinon.stub().resolves({
          id: 1,
          title: 'Test PR',
          created_at: '2025-01-01T00:00:00Z',
          commits: 1,
          user: { login: 'author' },
          head: { repo: { contributors_url: 'url', events_url: 'url' } },
          base: { repo: { contributors_url: 'url' } },
          commits_url: 'url',
          issue_url: 'url',
          _links: { self: { href: 'url' } },
        }),
        getContributors: sinon.stub().resolves([
          { name: 'author', commits: 1, reviewValue: 0, timeValue: '' },
          { name: 'blocker', commits: 1, reviewValue: 0, timeValue: '' },
        ]),
        getReviews: sinon
          .stub()
          .resolves([
            { user: { login: 'blocker' }, state: 'CHANGES_REQUESTED' },
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
        1
      );

      // Coefficient = 0 (balanced)
      // But since we have one blocker and one author (both 1 commit), net is 0
      // Actually coefficient = (1 - 1) / 2 = 0
      assert.strictEqual(result.stats.coefficient, 0);

      // At coefficient 0, should use merge path with base time
      assert.strictEqual(result.times.action, 'merge');
      // totalMergeTime = 10 days = 864000 seconds
      assert.strictEqual(result.times.totalMergeTime, 864000);
    }
  );

  await t.test('Auto-close: Coefficient -0.5 closes at 50 days', async () => {
    const mockGitHubClient = {
      getPullRequest: sinon.stub().resolves({
        id: 1,
        title: 'Test PR',
        created_at: '2025-01-01T00:00:00Z',
        commits: 1,
        user: { login: 'author' },
        head: { repo: { contributors_url: 'url', events_url: 'url' } },
        base: { repo: { contributors_url: 'url' } },
        commits_url: 'url',
        issue_url: 'url',
        _links: { self: { href: 'url' } },
      }),
      getContributors: sinon.stub().resolves([
        { name: 'author', commits: 1, reviewValue: 0, timeValue: '' },
        { name: 'blocker', commits: 3, reviewValue: 0, timeValue: '' },
      ]),
      getReviews: sinon
        .stub()
        .resolves([{ user: { login: 'blocker' }, state: 'CHANGES_REQUESTED' }]),
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
      1
    );

    // Coefficient = (1 - 3) / 4 = -2/4 = -0.5
    assert.strictEqual(result.stats.coefficient, -0.5);
    assert.strictEqual(result.times.action, 'close');

    // closeDuration = (1 + (-0.5)) × baseCloseTime = 0.5 × (2400 hours)
    // = 0.5 × 100 days = 50 days = 4320000 seconds
    const expectedDuration = 0.5 * 2400 * 60 * 60; // 50 days in seconds
    assert.strictEqual(result.times.closeDuration, expectedDuration);
  });

  await t.test('Auto-close: Coefficient -1.0 closes immediately', async () => {
    const mockGitHubClient = {
      getPullRequest: sinon.stub().resolves({
        id: 1,
        title: 'Test PR',
        created_at: '2025-01-01T00:00:00Z',
        commits: 1,
        user: { login: 'author' },
        head: { repo: { contributors_url: 'url', events_url: 'url' } },
        base: { repo: { contributors_url: 'url' } },
        commits_url: 'url',
        issue_url: 'url',
        _links: { self: { href: 'url' } },
      }),
      getContributors: sinon.stub().resolves([
        { name: 'author', commits: 0, reviewValue: 0, timeValue: '' },
        { name: 'blocker', commits: 10, reviewValue: 0, timeValue: '' },
      ]),
      getReviews: sinon
        .stub()
        .resolves([{ user: { login: 'blocker' }, state: 'CHANGES_REQUESTED' }]),
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
      1
    );

    // Coefficient = (0 - 10) / 10 = -1.0
    assert.strictEqual(result.stats.coefficient, -1);
    assert.strictEqual(result.times.action, 'close');

    // closeDuration = (1 + (-1.0)) × baseCloseTime = 0 × anything = 0
    assert.strictEqual(
      result.times.closeDuration,
      0,
      'Should close immediately'
    );
  });

  await t.test(
    'Auto-close: Custom baseCloseTimeInHours from config',
    async () => {
      const iniContent = `
[DEFAULT]
baseCloseTimeInHours = 480
`;
      const base64Content = Buffer.from(iniContent).toString('base64');

      const mockGitHubClient = {
        getPullRequest: sinon.stub().resolves({
          id: 1,
          title: 'Test PR',
          created_at: '2025-01-01T00:00:00Z',
          commits: 1,
          user: { login: 'author' },
          head: { repo: { contributors_url: 'url', events_url: 'url' } },
          base: { repo: { contributors_url: 'url' } },
          commits_url: 'url',
          issue_url: 'url',
          _links: { self: { href: 'url' } },
        }),
        getContributors: sinon.stub().resolves([
          { name: 'author', commits: 1, reviewValue: 0, timeValue: '' },
          { name: 'blocker', commits: 1, reviewValue: 0, timeValue: '' },
        ]),
        getReviews: sinon
          .stub()
          .resolves([
            { user: { login: 'blocker' }, state: 'CHANGES_REQUESTED' },
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
        1
      );

      // Coefficient = 0 with equal positive and negative
      assert.strictEqual(result.stats.coefficient, 0);

      // Should use custom baseCloseTimeInHours = 480 (20 days)
      assert.strictEqual(result.config.baseCloseTimeInHours, 480);
    }
  );
});
