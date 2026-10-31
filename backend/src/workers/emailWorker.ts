import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import prisma from '../config/database';
import { createTransporter } from '../config/smtp';
import { checkRateLimit, getNextAvailableWindow, releaseRateLimit } from '../services/rateLimiter';
import { sendRateLimitNotification } from '../services/slackService';
import { indexEmail } from '../services/elasticsearchService';
import { emailQueue } from '../config/queue';
import config from '../config';
import { EmailJobData } from '../types';
import nodemailer from 'nodemailer';

const workerConnection = createRedisConnection();

const worker = new Worker(
  'email-sends',
  async (job: Job<EmailJobData>) => {
    const {
      emailJobId,
      recipient,
      subject,
      body,
      senderEmail,
      senderId,
      userId,
      maxPerHour,
    } = job.data;

    console.log(`Processing email job ${emailJobId} -> ${recipient}`);

    const emailJob = await prisma.emailJob.findUnique({ where: { id: emailJobId } });
    if (!emailJob) {
      console.log(`Email job ${emailJobId} not found, skipping`);
      return;
    }
    if (emailJob.status === 'SENT') {
      console.log(`Email job ${emailJobId} already sent, skipping`);
      return;
    }

    const effectiveSender = senderEmail || config.SMTP_USER;
    const rateCheck = await checkRateLimit(effectiveSender, maxPerHour);

    if (!rateCheck.allowed) {
      console.log(`Rate limit exceeded for ${effectiveSender}: ${rateCheck.currentCount}/${rateCheck.limit}`);

      const rateLimitedJob = await prisma.emailJob.update({
        where: { id: emailJobId },
        data: { status: 'RATE_LIMITED' },
      });
      await indexEmail(rateLimitedJob);
      await sendRateLimitNotification(userId, effectiveSender, rateCheck.currentCount, rateCheck.limit)
        .catch((err) => console.error('Slack notification failed:', err.message));

      const nextWindow = await getNextAvailableWindow(effectiveSender, maxPerHour);
      const delay = Math.max(nextWindow.getTime() - Date.now(), 1000);
      // Deterministic, monotonically-numbered retry id: the same reschedule
      // event always produces the same jobId (so a duplicated event dedupes),
      // while successive reschedules into later windows get distinct ids.
      const rescheduleCount = (job.data.rescheduleCount ?? 0) + 1;
      const retryJob = await emailQueue.add(
        'send-email',
        { ...job.data, rescheduleCount },
        {
          delay,
          jobId: `${emailJobId}-retry-${rescheduleCount}`,
        }
      );
      const rescheduledJob = await prisma.emailJob.update({
        where: { id: emailJobId },
        data: { bullmqJobId: retryJob.id ?? null },
      });
      await indexEmail(rescheduledJob);
      console.log(`Rate-limited job ${emailJobId} rescheduled with ${delay}ms delay`);
      return;
    }

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: { status: 'SENDING' },
    });

    // Load SMTP credentials from the DB at send time (they're deliberately not
    // carried in the Redis job payload). Fall back to the configured default.
    let smtpUser = config.SMTP_USER;
    let smtpPass = config.SMTP_PASS;
    let smtpHost = config.SMTP_HOST;
    let smtpPort = config.SMTP_PORT;
    if (senderId) {
      const sender = await prisma.sender.findUnique({ where: { id: senderId } });
      if (sender) {
        smtpUser = sender.smtpUser;
        smtpPass = sender.smtpPass;
        smtpHost = sender.smtpHost;
        smtpPort = sender.smtpPort;
      }
    }

    const transporter = createTransporter(smtpUser, smtpPass, smtpHost, smtpPort);

    let info;
    try {
      info = await transporter.sendMail({
        from: effectiveSender,
        to: recipient,
        subject,
        html: body,
      });
    } catch (sendErr) {
      // The rate-limit slot was consumed by checkRateLimit above; return it so
      // the retry (or a permanent failure) doesn't leak hourly quota.
      await releaseRateLimit(effectiveSender);
      throw sendErr;
    }

    console.log(`Email sent to ${recipient}: ${info.messageId}`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`Preview URL: ${previewUrl}`);
    }

    await new Promise((resolve) => setTimeout(resolve, config.MIN_DELAY_BETWEEN_EMAILS_MS));

    const updatedJob = await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    await indexEmail(updatedJob);

    console.log(`Email job ${emailJobId} completed successfully`);
  },
  {
    connection: workerConnection,
    concurrency: config.WORKER_CONCURRENCY,
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', async (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);

  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    try {
      const failedJob = await prisma.emailJob.update({
        where: { id: job.data.emailJobId },
        data: {
          status: 'FAILED',
          errorMessage: err.message,
        },
      });
      await indexEmail(failedJob);
    } catch (updateErr: any) {
      console.error('Failed to update job status:', updateErr.message);
    }
  }
});

worker.on('error', (err) => {
  console.error('Worker error:', err.message);
});

console.log(
  `Email worker started with concurrency: ${config.WORKER_CONCURRENCY}`
);

export default worker;
