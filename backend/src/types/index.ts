export interface EmailJobData {
  emailJobId: string;
  recipient: string;
  subject: string;
  body: string;
  // Non-secret: used as the From address and the rate-limit key.
  senderEmail?: string;
  // SMTP credentials are NOT stored in the queue — the worker loads them from
  // the DB via senderId at send time so Redis never holds plaintext passwords.
  senderId?: string;
  userId: string;
  batchId?: string;
  maxPerHour?: number;
  rescheduleCount?: number;
}

export interface ScheduleEmailRequest {
  recipients: string[];
  subject: string;
  body: string;
  scheduledAt: string;
  senderId?: string;
  delayBetweenEmails?: number;
  maxPerHour?: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  resetAt: Date;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

declare global {
  namespace Express {
    /**
     * Passport declares `Request.user` as `Express.User`.  Extending that
     * interface (rather than redeclaring Request.user) keeps Passport and the
     * JWT middleware in agreement about the authenticated-user shape.
     */
    interface User extends AuthUser {}
  }
}
