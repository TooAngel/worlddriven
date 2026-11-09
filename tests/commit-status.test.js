import { test } from 'node:test';
import assert from 'node:assert';
import { generateKeyPairSync } from 'node:crypto';
import sinon from 'sinon';
import { setCommitStatusIfChanged } from '../src/helpers/github.js';

const SHA = 'abc123';
const URL_STATUS = `/repos/owner/repo/commits/${SHA}/status`;
const URL_POST = `/repos/owner/repo/statuses/${SHA}`;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubGitHub(statuses, { failLookup = false } = {}) {
  return sinon.stub(globalThis, 'fetch').callsFake(async (url, options) => {
    const { pathname } = new URL(url);
    if (pathname.endsWith('/access_tokens')) {
      return jsonResponse(
        {
          token: 'installation-token',
          expires_at: '2100-01-01T00:00:00Z',
          permissions: {},
          repository_selection: 'all',
        },
        201
      );
    }
    if (pathname === URL_STATUS) {
      return failLookup
        ? jsonResponse({ message: 'Server Error' }, 500)
        : jsonResponse({ statuses });
    }
    if (pathname === URL_POST && options.method === 'POST') {
      return jsonResponse({ id: 1 }, 201);
    }
    throw new Error(`Unexpected request: ${options.method} ${url}`);
  });
}

function posts(fetchStub) {
  return fetchStub
    .getCalls()
    .filter(call => new URL(call.args[0]).pathname === URL_POST);
}

function set(
  auth,
  description = '0.50 Merge at 2026-11-20',
  state = 'success'
) {
  return setCommitStatusIfChanged(
    auth,
    'owner',
    'repo',
    SHA,
    state,
    'https://www.worlddriven.org/owner/repo/pull/1',
    description
  );
}

const current = {
  context: 'World driven',
  state: 'success',
  description: '0.50 Merge at 2026-11-20',
};

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

// Production uses the GitHub App, the PAT path remains for user tokens
const authMethods = [
  ['GitHub App', 12345],
  ['PAT', { githubAccessToken: 'test-token' }],
];

for (const [name, auth] of authMethods) {
  test(`setCommitStatusIfChanged with ${name}`, async t => {
    let fetchStub;

    t.before(() => {
      process.env.GITHUB_APP_ID = '1';
      process.env.GITHUB_APP_PRIVATE_KEY = privateKey;
    });

    t.afterEach(() => {
      fetchStub.restore();
    });

    await t.test('does not post an unchanged status', async () => {
      fetchStub = stubGitHub([current]);
      await set(auth);
      assert.strictEqual(posts(fetchStub).length, 0);
    });

    await t.test('posts a changed description', async () => {
      fetchStub = stubGitHub([current]);
      await set(auth, '0.60 Merge at 2026-11-18');
      assert.strictEqual(posts(fetchStub).length, 1);
    });

    await t.test('posts a changed state', async () => {
      fetchStub = stubGitHub([current]);
      await set(auth, current.description, 'error');
      assert.strictEqual(posts(fetchStub).length, 1);
    });

    await t.test('posts the first status of a commit', async () => {
      fetchStub = stubGitHub([]);
      await set(auth);
      assert.strictEqual(posts(fetchStub).length, 1);
    });

    await t.test('ignores the status of another context', async () => {
      fetchStub = stubGitHub([{ ...current, context: 'CI' }]);
      await set(auth);
      assert.strictEqual(posts(fetchStub).length, 1);
    });

    await t.test('posts if the current status cannot be read', async () => {
      fetchStub = stubGitHub([], { failLookup: true });
      await set(auth);
      assert.strictEqual(posts(fetchStub).length, 1);
    });
  });
}
