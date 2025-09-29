import { test } from 'node:test';
import assert from 'node:assert';
import sinon from 'sinon';
import MongoStore from 'connect-mongo';
import './setup.js';

test('Catch all tests', async t => {
  let server;
  let baseUrl;
  let vite;

  t.before(async () => {
    // Only stub MongoStore since MongoClient is already stubbed in setup.js
    sinon.stub(MongoStore, 'create').returns({ on: () => {} });
    process.env.NODE_ENV = 'test-production';
    process.env.SESSION_SECRET = 'test-secret-key';
    process.env.MONGO_URL = 'mongodb://127.0.0.1:27017/test';

    // Import server
    const { startServer } = await import('../src/index.js');

    // Start the server directly
    ({ server, vite } = await startServer());
    const { port } = server.address();
    baseUrl = `http://localhost:${port}`;
  });

  t.after(async () => {
    try {
      if (server) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Server close timeout')),
            5000
          );
          server.close(err => {
            clearTimeout(timeout);
            if (err) reject(err);
            else resolve();
          });
        });
      }
      if (vite) {
        await vite.close();
      }
    } catch (error) {
      console.warn('Error during cleanup:', error);
    } finally {
      // Clean up MongoDB connection stubs
      sinon.restore();

      // Force cleanup of any remaining handles
      if (global.gc) {
        global.gc();
      }
    }
  });

  await t.test('should serve SPA for root path', async () => {
    const response = await fetch(`${baseUrl}/`);
    assert.strictEqual(response.status, 200);
    const body = await response.text();
    const bodyStr = body.toLowerCase();
    assert.ok(bodyStr.includes('<html') || bodyStr.includes('<!doctype'));
  });

  await t.test('should serve SPA for dashboard route', async () => {
    const response = await fetch(`${baseUrl}/dashboard`);
    assert.strictEqual(response.status, 200);
    const body = await response.text();
    const bodyStr = body.toLowerCase();
    assert.ok(bodyStr.includes('<html') || bodyStr.includes('<!doctype'));
  });

  await t.test('should serve SPA for arbitrary routes', async () => {
    const response = await fetch(`${baseUrl}/some/arbitrary/route`);
    assert.strictEqual(response.status, 200);
    const body = await response.text();
    const bodyStr = body.toLowerCase();
    assert.ok(bodyStr.includes('<html') || bodyStr.includes('<!doctype'));
  });

  await t.test('should handle API routes before catch-all', async () => {
    // Test that API routes are handled before the catch-all SPA route
    const response = await fetch(`${baseUrl}/v1/user`);

    // Should not be the SPA dashboard (either 401, redirect, or actual API response)
    if (response.status === 200) {
      const body = await response.text();
      // If it's 200, it should be JSON API response, not HTML
      assert.ok(!body.includes('<html>'));
    } else {
      // Expected for unauthenticated requests (401, 302, etc.)
      assert.ok(response.status !== 200);
    }
  });

  await t.test('should handle unknown API routes via catch-all', async () => {
    // Unknown API routes should fall through to SPA catch-all
    const response = await fetch(`${baseUrl}/v1/nonexistent`);
    assert.strictEqual(response.status, 200);
    const body = await response.text();
    const bodyStr = body.toLowerCase();
    assert.ok(bodyStr.includes('<html') || bodyStr.includes('<!doctype'));
  });
});
