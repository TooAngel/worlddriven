/**
 * Integration test for Express routing
 * Imports and starts the server directly, uses native fetch for HTTP requests
 */

import { test, mock } from 'node:test';
import assert from 'node:assert';

test('Express Server Integration Tests', async t => {
  let server;
  let baseUrl;

  t.before(async () => {
    // Set test environment - use test-production to test production routing without cron jobs
    process.env.NODE_ENV = 'test-production';
    process.env.SESSION_SECRET = 'test-secret-key';
    process.env.PORT = '0'; // Use random available port

    // Mock MongoDB by providing a database URL that will never connect
    // This way MongoDB client creation fails immediately without network attempts
    process.env.MONGO_URL = 'mongodb://mock-host-that-does-not-exist:1/test';

    // Suppress console errors from MongoDB connection failures
    const originalConsoleError = console.error;
    console.error = mock.fn();

    // Import server after setting up environment
    const { startServer } = await import('../src/index.js');

    // Start the server directly
    server = await startServer();
    const { port } = server.address();
    baseUrl = `http://localhost:${port}`;

    // Restore console.error
    console.error = originalConsoleError;
  });

  t.after(() => {
    if (server) {
      server.close();
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
