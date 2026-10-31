export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

export interface EmailJob {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt?: string;
  status: 'SCHEDULED' | 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'RATE_LIMITED';
  errorMessage?: string;
  batchId?: string;
  createdAt: string;
}

export interface Sender {
  id: string;
  email: string;
  smtpUser: string;
}

export interface EmailStats {
  scheduled: number;
  sent: number;
  failed: number;
  rateLimited: number;
  total: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ScheduleEmailPayload {
  subject: string;
  body: string;
  recipients: string[];
  senderId: string;
  scheduledAt: string;
  delayBetweenEmails?: number;
  maxPerHour?: number;
}
