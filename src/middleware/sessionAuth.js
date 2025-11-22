/**
 * Session Authentication Middleware
 *
 * Supports both cookie-based and header-based session authentication:
 * 1. Cookie-based: Traditional express-session (current frontend)
 * 2. Header-based: Authorization: SESSION <sessionId> (webapp proxy)
 *
 * This allows the webapp proxy to send session IDs via headers while
 * maintaining backward compatibility with cookie-based authentication.
 */

import { database } from '../database/database.js';

/**
 * Middleware to extract session ID from Authorization header
 * and populate req.session.userId for existing authentication logic
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export async function sessionAuthMiddleware(req, res, next) {
  // Check if Authorization header contains a session ID
  const authHeader = req.headers.authorization;

  // If no Authorization header or session already set via cookie, continue
  if (!authHeader || req.session.userId) {
    return next();
  }

  // Parse Authorization header format: "SESSION <sessionId>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'SESSION') {
    // Invalid format, continue without setting session
    return next();
  }

  const sessionId = parts[1];

  try {
    // Query MongoDB session store to get session data
    // Session ID in MongoDB is prefixed with "sess:"
    const sessionDoc = await database.sessions.findOne({
      _id: `sess:${sessionId}`,
    });

    if (!sessionDoc || !sessionDoc.session) {
      // Session not found or invalid
      console.warn(`Invalid session ID in Authorization header: ${sessionId}`);
      return next();
    }

    // Parse session data (stored as JSON string in MongoDB)
    const sessionData =
      typeof sessionDoc.session === 'string'
        ? JSON.parse(sessionDoc.session)
        : sessionDoc.session;

    // Check if session has expired
    if (sessionDoc.expires && new Date(sessionDoc.expires) < new Date()) {
      console.warn(`Expired session ID in Authorization header: ${sessionId}`);
      return next();
    }

    // Extract userId from session data and set it on req.session
    if (sessionData.userId) {
      req.session.userId = sessionData.userId;
      console.log(
        `Authenticated via Authorization header: userId=${sessionData.userId}`
      );
    }

    next();
  } catch (error) {
    console.error('Error processing session from Authorization header:', error);
    // Don't fail the request, just continue without authentication
    next();
  }
}
