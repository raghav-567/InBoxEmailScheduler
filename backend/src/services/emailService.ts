import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import { emailQueue } from '../config/queue';
import { indexEmailsBulk } from './elasticsearchService';
import { ScheduleEmailRequest, EmailJobData, PaginatedResult } from '../types';
import { EmailJob, Sender } from '@prisma/client';
import config from '../config';

type EmailJobWithSender = EmailJob & { sender: Sender | null };

/**
 * Build the BullMQ payload for an email job from its DB record (+ sender).
 * Shared by the schedule path and the startup reconciliation sweep so both
 * produce an identical job shape.
 */
function buildJobData(job: EmailJobWithSender): EmailJobData {
  return {
    emailJobId: job.id,
    recipient: job.recipient,
    subject: job.subject,
    body: job.body,
    senderEmail: job.sender?.email || config.SMTP_USER,
    senderId: job.senderId ?? undefined,
    userId: job.userId,
    batchId: job.batchId ?? undefined,
    maxPerHour: job.maxPerHour ?? undefined,
  };
}

// Never send SMTP credentials (especially smtpPass) to the browser.
const senderPublicSelect = {
  id: true,
  email: true,
  smtpUser: true,
  smtpHost: true,
  smtpPort: true,
} as const;

export async function scheduleEmails(
  data: ScheduleEmailRequest,
  userId: string
): Promise<EmailJob[]> {
  const {
    recipients,
    subject,
    body,
    scheduledAt,
    senderId,
    delayBetweenEmails = config.MIN_DELAY_BETWEEN_EMAILS_MS,
    maxPerHour,
  } = data;

  const scheduledTime = new Date(scheduledAt);
  const batchId = uuidv4();

  let sender: Sender | null = null;
  if (senderId) {
    sender = await prisma.sender.findFirst({ where: { id: senderId, userId } });
    if (!sender) throw new Error('Selected sender was not found');
  }

  const cleanRecipients = recipients.map((r) => r.trim()).filter(Boolean);
  if (cleanRecipients.length === 0) return [];

  const baseDelay = Math.max(0, scheduledTime.getTime() - Date.now());

  // Pre-generate ids so the DB row id, the BullMQ jobId and the ES document id
  // are all identical (idempotent dedupe) without a per-row round-trip.  The
  // row is created already-QUEUED because jobId === id is deterministic.
  const rows = cleanRecipients.map((recipient, i) => {
    const id = uuidv4();
    return {
      id,
      recipient,
      subject,
      body,
      scheduledAt: scheduledTime,
      status: 'QUEUED' as const,
      bullmqJobId: id,
      maxPerHour: maxPerHour ?? null,
      userId,
      senderId: senderId || null,
      batchId,
      delay: baseDelay + i * delayBetweenEmails,
    };
  });

  // Bulk DB insert — one query regardless of batch size.
  await prisma.emailJob.createMany({
    data: rows.map(({ delay, ...data }) => data),
  });

  // Bulk enqueue — one queue round-trip regardless of batch size.
  await emailQueue.addBulk(
    rows.map((row) => ({
      name: 'send-email',
      data: buildJobData({ ...(row as unknown as EmailJob), sender } as EmailJobWithSender),
      opts: { delay: row.delay, jobId: row.id },
    }))
  );

  // Fetch the persisted rows (single query) for the response + bulk indexing.
  const createdJobs = await prisma.emailJob.findMany({
    where: { batchId },
    orderBy: { createdAt: 'asc' },
  });

  await indexEmailsBulk(createdJobs);

  return createdJobs;
}

/**
 * On startup, re-enqueue any pending email job whose BullMQ job is missing from
 * Redis.  Normal restarts are covered by Redis AOF persistence, but if Redis
 * ever loses data while the DB still shows a job as pending, this sweep makes
 * the DB the source of truth and prevents silently-orphaned emails.  The
 * worker's `status === 'SENT'` guard keeps this from ever re-sending.
 */
export async function reconcilePendingJobs(): Promise<number> {
  const pending = await prisma.emailJob.findMany({
    where: { status: { in: ['SCHEDULED', 'QUEUED', 'RATE_LIMITED'] } },
    include: { sender: true },
  });

  const toAdd: {
    name: string;
    data: EmailJobData;
    opts: { delay: number; jobId: string };
  }[] = [];

  for (const job of pending) {
    const existing = job.bullmqJobId ? await emailQueue.getJob(job.bullmqJobId) : null;
    if (existing) continue;

    toAdd.push({
      name: 'send-email',
      data: buildJobData(job),
      opts: {
        delay: Math.max(0, job.scheduledAt.getTime() - Date.now()),
        jobId: job.id,
      },
    });
  }

  if (toAdd.length > 0) {
    await emailQueue.addBulk(toAdd);
    await prisma.$transaction(
      toAdd.map((j) =>
        prisma.emailJob.update({
          where: { id: j.opts.jobId },
          data: { bullmqJobId: j.opts.jobId },
        })
      )
    );
    console.log(`Reconciled ${toAdd.length} pending email job(s) back into the queue`);
  }

  return toAdd.length;
}

export async function getScheduledEmails(
  userId: string,
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResult<EmailJob>> {
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.emailJob.findMany({
      where: {
        userId,
        status: { in: ['SCHEDULED', 'QUEUED', 'RATE_LIMITED'] },
      },
      orderBy: { scheduledAt: 'asc' },
      skip,
      take: limit,
      include: { sender: { select: senderPublicSelect } },
    }),
    prisma.emailJob.count({
      where: {
        userId,
        status: { in: ['SCHEDULED', 'QUEUED', 'RATE_LIMITED'] },
      },
    }),
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getSentEmails(
  userId: string,
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResult<EmailJob>> {
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.emailJob.findMany({
      where: {
        userId,
        status: { in: ['SENT', 'FAILED', 'SENDING'] },
      },
      orderBy: { sentAt: 'desc' },
      skip,
      take: limit,
      include: { sender: { select: senderPublicSelect } },
    }),
    prisma.emailJob.count({
      where: {
        userId,
        status: { in: ['SENT', 'FAILED', 'SENDING'] },
      },
    }),
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function searchEmails(
  userId: string,
  query: string,
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResult<EmailJob>> {
  try {
    const { searchEmails: esSearch } = await import('./elasticsearchService');
    return await esSearch(userId, query, page, limit);
  } catch (error) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.emailJob.findMany({
        where: {
          userId,
          OR: [
            { recipient: { contains: query, mode: 'insensitive' } },
            { subject: { contains: query, mode: 'insensitive' } },
            { body: { contains: query, mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.emailJob.count({
        where: {
          userId,
          OR: [
            { recipient: { contains: query, mode: 'insensitive' } },
            { subject: { contains: query, mode: 'insensitive' } },
            { body: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

export async function getEmailStats(userId: string): Promise<{
  scheduled: number;
  sent: number;
  failed: number;
  rateLimited: number;
  total: number;
}> {
  const [scheduled, sent, failed, rateLimited, total] = await Promise.all([
    prisma.emailJob.count({ where: { userId, status: { in: ['SCHEDULED', 'QUEUED', 'RATE_LIMITED'] } } }),
    prisma.emailJob.count({ where: { userId, status: 'SENT' } }),
    prisma.emailJob.count({ where: { userId, status: 'FAILED' } }),
    prisma.emailJob.count({ where: { userId, status: 'RATE_LIMITED' } }),
    prisma.emailJob.count({ where: { userId } }),
  ]);

  return { scheduled, sent, failed, rateLimited, total };
}
