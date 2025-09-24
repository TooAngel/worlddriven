import {
  createIssueComment,
  updateIssueComment,
  findWorlddrivenComment,
} from './github.js';

/**
 * Format date for display
 * @param {Date} date
 * @return {string}
 */
function formatDate(date) {
  return date.toISOString().replace('T', ' at ').split('.')[0] + ' UTC';
}

/**
 * Format relative time (e.g., "in 3 days", "2 days ago")
 * @param {Date} targetDate
 * @return {string}
 */
function formatRelativeTime(targetDate) {
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
  } else if (diffDays < 0) {
    return `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago`;
  } else {
    return 'today';
  }
}

/**
 * Calculate speed factor and description
 * @param {object} pullRequestData
 * @return {object}
 */
function calculateSpeedMetrics(pullRequestData) {
  const baseTime = pullRequestData.times.totalMergeTime;
  const currentTime = pullRequestData.times.mergeDuration;
  const speedFactor = currentTime / baseTime;
  const percentChange = Math.round((1 - speedFactor) * 100);

  let description = '';
  if (percentChange > 0) {
    description = `${percentChange}% faster due to reviews`;
  } else if (percentChange < 0) {
    description = `${Math.abs(percentChange)}% slower due to reviews`;
  } else {
    description = 'no change from reviews';
  }

  return { speedFactor: speedFactor.toFixed(2), description };
}

/**
 * Generate Section 1: Live Status Dashboard
 * @param {object} pullRequestData
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @return {string}
 */
function generateStatusSection(pullRequestData, _owner, _repo, _pullNumber) {
  const mergeDate = new Date(pullRequestData.times.mergeDate * 1000);
  const startDate = new Date(pullRequestData.dates.max);
  const { speedFactor, description } = calculateSpeedMetrics(pullRequestData);
  const agrees = pullRequestData.stats.votes;
  const total = pullRequestData.stats.votesTotal;
  const disagrees = total - agrees; // Simplified - actual disagrees would need tracking
  const baseDays = Math.round(
    pullRequestData.times.totalMergeTime / (24 * 60 * 60)
  );
  const currentDays = Math.round(
    pullRequestData.times.mergeDuration / (24 * 60 * 60)
  );

  return `## 🤖 **Worlddriven Status**

### 📊 **Live Status Dashboard**
🗓️ **Merge Date:** ${formatDate(mergeDate)} (${formatRelativeTime(mergeDate)})
📅 **Started:** ${formatDate(startDate)}
⚡ **Speed Factor:** ${speedFactor} (${description})
✅ **Agrees:** ${agrees} contributors | ❌ **Disagrees:** ${disagrees} contributors (coefficient: ${pullRequestData.stats.coefficient.toFixed(2)})
📈 **Base Merge Time:** ${baseDays} days → **Current:** ${currentDays} days`;
}

/**
 * Generate Section 2: Review Instructions
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @return {string}
 */
function generateInstructionsSection(owner, repo, pullNumber) {
  return `
### 🎯 **Want to influence when this merges?**

Your review matters! As a contributor to this project, your voice helps determine the merge timeline.

#### How to review:
1. **Check the changes**
   ![Files changed](https://www.worlddriven.org/images/github-files-changed.png)

2. **Leave your review**
   ![Review changes](https://www.worlddriven.org/images/github-review-changes.png)

#### Your options:
- **✅ Agree & Speed Up:** ![Approve](https://www.worlddriven.org/images/github-approve.png) *Approving makes this merge faster*
- **❌ Disagree & Slow Down:** ![Request changes](https://www.worlddriven.org/images/github-request-changes.png) *Requesting changes delays the merge*

💡 **Pro tip:** The more contributors who agree, the faster this gets merged!

📊 [View detailed stats on the dashboard](https://www.worlddriven.org/${owner}/${repo}/pull/${pullNumber})`;
}

/**
 * Generate Section 3: Activity Log
 * @param {Array} activityLog
 * @return {string}
 */
function generateActivitySection(activityLog) {
  if (!activityLog || activityLog.length === 0) {
    return `
### 📋 **Recent Activity**
• *No activity yet*`;
  }

  const logEntries = activityLog
    .slice(-5) // Show only last 5 entries
    .map(entry => `• **${entry.date}** - ${entry.message}`)
    .join('\n');

  return `
### 📋 **Recent Activity**
${logEntries}`;
}

/**
 * Generate complete worlddriven comment
 * @param {object} pullRequestData
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @param {Array} activityLog
 * @return {string}
 */
export function generateWorlddrivenComment(
  pullRequestData,
  owner,
  repo,
  pullNumber,
  activityLog = []
) {
  const statusSection = generateStatusSection(
    pullRequestData,
    owner,
    repo,
    pullNumber
  );
  const instructionsSection = generateInstructionsSection(
    owner,
    repo,
    pullNumber
  );
  const activitySection = generateActivitySection(activityLog);

  return `${statusSection}${instructionsSection}${activitySection}

---
*This comment is automatically updated by [worlddriven](https://www.worlddriven.org)*`;
}

/**
 * Extract activity log from existing comment
 * @param {string} commentBody
 * @return {Array}
 */
function extractActivityLog(commentBody) {
  const activityMatch = commentBody.match(
    /### 📋 \*\*Recent Activity\*\*\n([\s\S]*?)(?:\n---|\n### |\n##|$)/
  );
  if (!activityMatch) return [];

  const activityText = activityMatch[1];
  const entries = activityText
    .split('\n')
    .filter(line => line.trim().startsWith('•'))
    .map(line => {
      const match = line.match(/• \*\*(.*?)\*\* - (.*)/);
      if (match) {
        return { date: match[1], message: match[2] };
      }
      return null;
    })
    .filter(entry => entry !== null);

  return entries;
}

/**
 * Add new activity log entry
 * @param {Array} existingLog
 * @param {string} message
 * @return {Array}
 */
function addActivityEntry(existingLog, message) {
  const now = new Date();
  const dateStr =
    now.toISOString().split('T')[0] + ', ' + now.toTimeString().split(' ')[0];

  const newEntry = {
    date: dateStr,
    message: message,
  };

  return [...existingLog, newEntry];
}

/**
 * Update or create worlddriven comment
 * @param {object|number} userOrInstallationId
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @param {object} pullRequestData
 * @param {string} activityMessage - New activity to log
 * @return {object} Comment object
 */
export async function updateOrCreateWorlddrivenComment(
  userOrInstallationId,
  owner,
  repo,
  pullNumber,
  pullRequestData,
  activityMessage
) {
  try {
    // Find existing comment
    const existingComment = await findWorlddrivenComment(
      userOrInstallationId,
      owner,
      repo,
      pullNumber
    );

    let activityLog = [];
    if (existingComment) {
      // Extract existing activity log
      activityLog = extractActivityLog(existingComment.body);
    }

    // Add new activity entry
    if (activityMessage) {
      activityLog = addActivityEntry(activityLog, activityMessage);
    }

    // Generate updated comment
    const commentBody = generateWorlddrivenComment(
      pullRequestData,
      owner,
      repo,
      pullNumber,
      activityLog
    );

    if (existingComment) {
      // Update existing comment
      console.log(
        `Updating worlddriven comment #${existingComment.id} on ${owner}/${repo}#${pullNumber}`
      );
      return await updateIssueComment(
        userOrInstallationId,
        owner,
        repo,
        existingComment.id,
        commentBody
      );
    } else {
      // Create new comment
      console.log(
        `Creating worlddriven comment on ${owner}/${repo}#${pullNumber}`
      );
      return await createIssueComment(
        userOrInstallationId,
        owner,
        repo,
        pullNumber,
        commentBody
      );
    }
  } catch (error) {
    console.error('Failed to update or create worlddriven comment:', error);
    throw error;
  }
}
