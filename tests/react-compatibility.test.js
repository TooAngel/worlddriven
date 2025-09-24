import { test } from 'node:test';
import assert from 'node:assert';
import './setup.js';

test('React compatibility improvements', async t => {
  await t.test(
    'script.jsx should use createRoot instead of ReactDOM.render',
    async () => {
      const fs = await import('fs');
      const scriptContent = fs.readFileSync(
        './src/public/js/script.jsx',
        'utf8'
      );

      // Should not use the old ReactDOM.render API
      assert.ok(!scriptContent.includes('ReactDOM.render('));

      // Should use the new createRoot API
      assert.ok(scriptContent.includes('createRoot'));
      assert.ok(scriptContent.includes('root.render('));

      // Should import from react-dom/client
      assert.ok(scriptContent.includes('react-dom/client'));
    }
  );

  await t.test('static HTML files should use correct image paths', async () => {
    const fs = await import('fs');

    // Check imprint.html
    const imprintContent = fs.readFileSync('./static/imprint.html', 'utf8');
    assert.ok(!imprintContent.includes('/static/images/'));
    assert.ok(imprintContent.includes('/images/'));

    // Check privacyPolicy.html
    const privacyContent = fs.readFileSync(
      './static/privacyPolicy.html',
      'utf8'
    );
    assert.ok(!privacyContent.includes('/static/images/'));
    assert.ok(privacyContent.includes('/images/'));
  });

  await t.test('webhook handler should use new comment system', async () => {
    const fs = await import('fs');
    const webhookContent = fs.readFileSync(
      './src/helpers/webhookHandler.js',
      'utf8'
    );

    // Should not use old createIssueComment directly in webhook handlers
    assert.ok(!webhookContent.includes('await createIssueComment('));

    // Should import updateOrCreateWorlddrivenComment
    assert.ok(webhookContent.includes('updateOrCreateWorlddrivenComment'));

    // Should have activity messages for different webhook types
    assert.ok(webhookContent.includes('Pull request opened'));
    assert.ok(webhookContent.includes('Branch synchronized'));
    assert.ok(webhookContent.includes('**agreed**'));
    assert.ok(webhookContent.includes('**disagreed**'));
  });

  await t.test('comment manager should exist with proper exports', async () => {
    const commentModule = await import('../src/helpers/commentManager.js');

    // Should export the main functions
    assert.ok(typeof commentModule.generateWorlddrivenComment === 'function');
    assert.ok(
      typeof commentModule.updateOrCreateWorlddrivenComment === 'function'
    );
  });

  await t.test(
    'github helpers should include new comment functions',
    async () => {
      const githubModule = await import('../src/helpers/github.js');

      // Should export new comment-related functions
      assert.ok(typeof githubModule.listIssueComments === 'function');
      assert.ok(typeof githubModule.updateIssueComment === 'function');
      assert.ok(typeof githubModule.findWorlddrivenComment === 'function');
    }
  );
});
