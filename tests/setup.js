import sinon from 'sinon';

// Store original fetch for restoration
const originalFetch = globalThis.fetch;

/**
 * Setup selective fetch mock for GitHub API calls only
 * This prevents real GitHub API calls during testing while allowing other HTTP requests
 */
export function setupGlobalMocks() {
  // Only set up the mock if it doesn't exist
  if (!global.fetch || !global.fetch.isSinonProxy) {
    global.fetch = sinon.stub();

    // Selective mock behavior - only intercept GitHub API calls
    global.fetch.callsFake(async (url, options) => {
      // Only mock GitHub API calls, let everything else pass through
      if (url.includes('github.com/repos') || url.includes('api.github.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => {
            // Return appropriate mock data based on endpoint
            if (url.includes('/comments')) {
              if (options?.method === 'PATCH') {
                // Update comment response
                return { id: 123, body: 'Updated comment' };
              }
              // List comments response
              return [];
            }
            if (url.includes('/commits')) {
              return [{ sha: 'mock-sha-123' }];
            }
            if (url.includes('/statuses')) {
              return { id: 456, state: 'success' };
            }
            if (url.includes('/pulls')) {
              return [];
            }
            // Default empty response
            return {};
          },
        };
      }

      // For non-GitHub URLs, use the original fetch
      return originalFetch(url, options);
    });

    // Mark the stub so tests can identify it
    global.fetch.isSinonProxy = true;
  }
}

// Clean up function for individual tests
export function resetFetchMock() {
  if (global.fetch?.resetHistory) {
    global.fetch.resetHistory();
  }
}

// Auto-setup when this module is imported
setupGlobalMocks();