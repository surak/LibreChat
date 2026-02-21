import type * as t from '~/types/session';
import { signPayload, hashToken } from '~/crypto';
import logger from '~/config/winston';
import { nanoid } from 'nanoid';

export class SessionError extends Error {
  public code: string;

  constructor(message: string, code: string = 'SESSION_ERROR') {
    super(message);
    this.name = 'SessionError';
    this.code = code;
  }
}

/** Default refresh token expiry: 7 days in milliseconds */
export const DEFAULT_REFRESH_TOKEN_EXPIRY = 1000 * 60 * 60 * 24 * 7;

const sessionStore = new Map<string, t.ISession>();

// Factory function that returns the methods
export function createSessionMethods() {
  /**
   * Creates a new session for a user
   */
  async function createSession(
    userId: string,
    options: t.CreateSessionOptions = {},
  ): Promise<t.SessionResult> {
    if (!userId) {
      throw new SessionError('User ID is required', 'INVALID_USER_ID');
    }

    const expiresIn = options.expiresIn ?? DEFAULT_REFRESH_TOKEN_EXPIRY;

    try {
      const sessionId = nanoid();
      const currentSession: t.ISession = {
        _id: sessionId,
        user: userId,
        expiration: options.expiration || new Date(Date.now() + expiresIn),
      } as any;

      const refreshToken = await generateRefreshToken(currentSession);
      sessionStore.set(sessionId, currentSession);

      return { session: currentSession, refreshToken };
    } catch (error) {
      logger.error('[createSession] Error creating session:', error);
      throw new SessionError('Failed to create session', 'CREATE_SESSION_FAILED');
    }
  }

  /**
   * Finds a session by various parameters
   */
  async function findSession(
    params: t.SessionSearchParams,
    _options: t.SessionQueryOptions = { lean: true },
  ): Promise<t.ISession | null> {
    try {
      if (!params.refreshToken && !params.userId && !params.sessionId) {
        throw new SessionError(
          'At least one search parameter is required',
          'INVALID_SEARCH_PARAMS',
        );
      }

      for (const session of sessionStore.values()) {
        if (params.refreshToken) {
           const tokenHash = await hashToken(params.refreshToken);
           if (session.refreshTokenHash !== tokenHash) continue;
        }

        if (params.userId && session.user !== params.userId) continue;

        if (params.sessionId) {
           const sid = typeof params.sessionId === 'object' ? (params.sessionId as any).sessionId : params.sessionId;
           if (session._id !== sid) continue;
        }

        if (new Date(session.expiration) <= new Date()) continue;

        return session;
      }

      return null;
    } catch (error) {
      logger.error('[findSession] Error finding session:', error);
      throw new SessionError('Failed to find session', 'FIND_SESSION_FAILED');
    }
  }

  /**
   * Updates session expiration
   */
  async function updateExpiration(
    session: t.ISession | string,
    newExpiration?: Date,
    options: t.UpdateExpirationOptions = {},
  ): Promise<t.ISession> {
    const expiresIn = options.expiresIn ?? DEFAULT_REFRESH_TOKEN_EXPIRY;

    try {
      const sessionId = typeof session === 'string' ? session : session._id;
      const sessionDoc = sessionStore.get(sessionId as string);

      if (!sessionDoc) {
        throw new SessionError('Session not found', 'SESSION_NOT_FOUND');
      }

      sessionDoc.expiration = newExpiration || new Date(Date.now() + expiresIn);
      sessionStore.set(sessionId as string, sessionDoc);
      return sessionDoc;
    } catch (error) {
      logger.error('[updateExpiration] Error updating session:', error);
      throw new SessionError('Failed to update session expiration', 'UPDATE_EXPIRATION_FAILED');
    }
  }

  /**
   * Deletes a session by refresh token or session ID
   */
  async function deleteSession(params: t.DeleteSessionParams): Promise<{ deletedCount?: number }> {
    try {
      if (!params.refreshToken && !params.sessionId) {
        throw new SessionError(
          'Either refreshToken or sessionId is required',
          'INVALID_DELETE_PARAMS',
        );
      }

      let deletedCount = 0;
      for (const [id, session] of sessionStore.entries()) {
        if (params.refreshToken) {
           const tokenHash = await hashToken(params.refreshToken);
           if (session.refreshTokenHash === tokenHash) {
              sessionStore.delete(id);
              deletedCount++;
              break;
           }
        } else if (params.sessionId && id === params.sessionId) {
           sessionStore.delete(id);
           deletedCount++;
           break;
        }
      }

      return { deletedCount };
    } catch (error) {
      logger.error('[deleteSession] Error deleting session:', error);
      throw new SessionError('Failed to delete session', 'DELETE_SESSION_FAILED');
    }
  }

  /**
   * Deletes all sessions for a user
   */
  async function deleteAllUserSessions(
    userId: string | { userId: string },
    options: t.DeleteAllSessionsOptions = {},
  ): Promise<{ deletedCount?: number }> {
    try {
      if (!userId) {
        throw new SessionError('User ID is required', 'INVALID_USER_ID');
      }

      const userIdString =
        typeof userId === 'object' && userId !== null ? userId.userId : (userId as string);

      let deletedCount = 0;
      for (const [id, session] of sessionStore.entries()) {
        if (session.user === userIdString) {
           if (options.excludeCurrentSession && options.currentSessionId === id) continue;
           sessionStore.delete(id);
           deletedCount++;
        }
      }

      return { deletedCount };
    } catch (error) {
      logger.error('[deleteAllUserSessions] Error deleting user sessions:', error);
      throw new SessionError('Failed to delete user sessions', 'DELETE_ALL_SESSIONS_FAILED');
    }
  }

  /**
   * Generates a refresh token for a session
   */
  async function generateRefreshToken(session: t.ISession): Promise<string> {
    if (!session || !session.user) {
      throw new SessionError('Invalid session object', 'INVALID_SESSION');
    }

    try {
      const expiresIn = session.expiration
        ? new Date(session.expiration).getTime()
        : Date.now() + DEFAULT_REFRESH_TOKEN_EXPIRY;

      if (!session.expiration) {
        session.expiration = new Date(expiresIn);
      }

      const refreshToken = await signPayload({
        payload: {
          id: session.user,
          sessionId: session._id,
        },
        secret: process.env.JWT_REFRESH_SECRET as string,
        expirationTime: Math.floor((expiresIn - Date.now()) / 1000),
      });

      session.refreshTokenHash = await hashToken(refreshToken);
      return refreshToken;
    } catch (error) {
      logger.error('[generateRefreshToken] Error generating refresh token:', error);
      throw new SessionError('Failed to generate refresh token', 'GENERATE_TOKEN_FAILED');
    }
  }

  /**
   * Counts active sessions for a user
   */
  async function countActiveSessions(userId: string): Promise<number> {
    try {
      if (!userId) {
        throw new SessionError('User ID is required', 'INVALID_USER_ID');
      }

      let count = 0;
      for (const session of sessionStore.values()) {
        if (session.user === userId && new Date(session.expiration) > new Date()) {
          count++;
        }
      }
      return count;
    } catch (error) {
      logger.error('[countActiveSessions] Error counting active sessions:', error);
      throw new SessionError('Failed to count active sessions', 'COUNT_SESSIONS_FAILED');
    }
  }

  return {
    findSession,
    SessionError,
    deleteSession,
    createSession,
    updateExpiration,
    countActiveSessions,
    generateRefreshToken,
    deleteAllUserSessions,
  };
}

export type SessionMethods = ReturnType<typeof createSessionMethods>;
