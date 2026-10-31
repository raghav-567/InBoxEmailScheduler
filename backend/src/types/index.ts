export interface EmailJobData {
  emailJobId: string;
  recipient: string;
  subject: string;
  body: string;
  senderEmail?: string;
  smtpUser?: string;
  smtpPass?: string;
  smtpHost?: string;
  smtpPort?: number;
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
