import { test } from 'node:test';
import assert from 'node:assert';

test('Date calculation bug demonstration', async t => {
  await t.test('Math.max with Date objects works correctly', async () => {
    // Math.max with Date objects actually works correctly
    const date1 = new Date('2025-09-24T06:02:48Z');
    const date2 = new Date('2025-09-25T19:11:10Z');

    // Math.max automatically converts dates to timestamps
    const result = Math.max(date1, date2);
    console.log('Result:', result, 'Type:', typeof result);

    // This is equivalent to:
    const explicitResult = Math.max(date1.getTime(), date2.getTime());
    console.log(
      'Explicit result:',
      explicitResult,
      'Type:',
      typeof explicitResult
    );
    console.log('Date:', new Date(result).toISOString());

    // Both approaches give the same result
    assert.strictEqual(result, explicitResult);

    // Verify we get the correct date
    assert.strictEqual(
      new Date(result).toISOString(),
      '2025-09-25T19:11:10.000Z'
    );
  });

  await t.test('Mixed Date/timestamp returns in reduce', async () => {
    const events = [
      { type: 'PushEvent', created_at: '2025-09-24T06:02:48Z' },
      { type: 'PushEvent', created_at: '2025-09-25T19:11:10Z' },
      { type: 'IssueEvent', created_at: '2025-09-25T12:00:00Z' },
    ];

    // This mimics the buggy code from lines 144-156
    const buggyPush = events
      .reduce((total, current) => {
        if (current.type !== 'PushEvent') {
          return new Date(total); // Returns Date object
        }
        return new Date( // Returns Date object
          Math.max(
            new Date(total).getTime(),
            new Date(current.created_at).getTime()
          )
        );
      }, new Date('January 1, 1970 00:00:00 UTC'))
      .getTime(); // Then calls .getTime()

    // Correct approach - keep timestamps throughout
    const correctPush = events.reduce((total, current) => {
      if (current.type !== 'PushEvent') {
        return total; // Return timestamp
      }
      return Math.max(total, new Date(current.created_at).getTime());
    }, new Date('January 1, 1970 00:00:00 UTC').getTime());

    console.log('Buggy push result:', new Date(buggyPush).toISOString());
    console.log('Correct push result:', new Date(correctPush).toISOString());

    // Both should give the same result, but the buggy version is confusing
    assert.strictEqual(buggyPush, correctPush);
    assert.strictEqual(
      new Date(correctPush).toISOString(),
      '2025-09-25T19:11:10.000Z'
    );
  });
});
