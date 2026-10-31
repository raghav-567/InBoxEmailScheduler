import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse';
import { Readable } from 'stream';
import { authenticateToken } from '../middleware/auth';
import {
  scheduleEmails,
  getScheduledEmails,
  getSentEmails,
  searchEmails,
  getEmailStats,
} from '../services/emailService';
import { ScheduleEmailRequest } from '../types';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'text/csv' ||
      file.mimetype === 'text/plain' ||
      /\.(csv|txt)$/i.test(file.originalname)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV or TXT files are allowed'));
    }
  },
});

router.post('/schedule', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { recipients, subject, body, scheduledAt, senderId, delayBetweenEmails, maxPerHour } =
      req.body as ScheduleEmailRequest;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      res.status(400).json({ error: 'Recipients array is required and must not be empty' });
      return;
    }

    const MAX_RECIPIENTS = 5000;
    if (recipients.length > MAX_RECIPIENTS) {
      res.status(400).json({
        error: `Too many recipients in one request (max ${MAX_RECIPIENTS}). Split the batch.`,
      });
      return;
    }

    if (!subject || !body) {
      res.status(400).json({ error: 'Subject and body are required' });
      return;
    }

    if (!scheduledAt) {
      res.status(400).json({ error: 'scheduledAt is required (ISO date string)' });
      return;
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      res.status(400).json({ error: 'Invalid scheduledAt date format' });
      return;
    }

    if (
      delayBetweenEmails !== undefined &&
      (!Number.isInteger(delayBetweenEmails) || delayBetweenEmails < 0)
    ) {
      res.status(400).json({ error: 'delayBetweenEmails must be a non-negative integer' });
      return;
    }

    if (
      maxPerHour !== undefined &&
      (!Number.isInteger(maxPerHour) || maxPerHour < 1)
    ) {
      res.status(400).json({ error: 'maxPerHour must be a positive integer' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = recipients.filter((r) => !emailRegex.test(r.trim()));
    if (invalidEmails.length > 0) {
      res.status(400).json({
        error: `Invalid email addresses: ${invalidEmails.join(', ')}`,
      });
      return;
    }

    const jobs = await scheduleEmails(
      { recipients, subject, body, scheduledAt, senderId, delayBetweenEmails, maxPerHour },
      userId
    );

    res.status(201).json({
      message: `${jobs.length} email(s) scheduled successfully`,
      batchId: jobs[0]?.batchId,
      jobs: jobs.map((j) => ({
        id: j.id,
        recipient: j.recipient,
        status: j.status,
        scheduledAt: j.scheduledAt,
      })),
    });
  } catch (error: any) {
    console.error('Schedule emails error:', error);
    const isInvalidSender = error.message === 'Selected sender was not found';
    res.status(isInvalidSender ? 404 : 500).json({
      error: isInvalidSender ? error.message : 'Failed to schedule emails',
    });
  }
});

router.get('/scheduled', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await getScheduledEmails(userId, page, limit);
    res.json(result);
  } catch (error: any) {
    console.error('Get scheduled emails error:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled emails' });
  }
});

router.get('/sent', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await getSentEmails(userId, page, limit);
    res.json(result);
  } catch (error: any) {
    console.error('Get sent emails error:', error);
    res.status(500).json({ error: 'Failed to fetch sent emails' });
  }
});

router.get('/search', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const query = req.query.q as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!query) {
      res.status(400).json({ error: 'Search query parameter "q" is required' });
      return;
    }

    const result = await searchEmails(userId, query, page, limit);
    res.json(result);
  } catch (error: any) {
    console.error('Search emails error:', error);
    res.status(500).json({ error: 'Failed to search emails' });
  }
});

router.get('/stats', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await getEmailStats(userId);
    res.json(stats);
  } catch (error: any) {
    console.error('Get email stats error:', error);
    res.status(500).json({ error: 'Failed to fetch email statistics' });
  }
});

router.post(
  '/upload-csv',
  authenticateToken,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'CSV or TXT file is required' });
        return;
      }

      const emails: string[] = [];
      const content = req.file.buffer.toString('utf-8');

      const isTextFile = /\.txt$/i.test(req.file.originalname) || req.file.mimetype === 'text/plain';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (isTextFile) {
        content.split(/[\s,;]+/).forEach((value) => {
          const email = value.trim();
          if (emailRegex.test(email)) emails.push(email);
        });
      } else {
        await new Promise<void>((resolve, reject) => {
          const readable = Readable.from(content);
          const csvParser = readable.pipe(
            parse({
              columns: true,
              skip_empty_lines: true,
              trim: true,
              relax_column_count: true,
            })
          );

          csvParser.on('data', (row: Record<string, string>) => {
            const emailField =
              row.email || row.Email || row.EMAIL || row['e-mail'] || row['E-mail'];
            if (emailField && emailRegex.test(emailField.trim())) {
              emails.push(emailField.trim());
            }
          });

          csvParser.on('end', () => resolve());
          csvParser.on('error', (err: Error) => reject(err));
        });
      }

      const uniqueEmails = [...new Set(emails)];

      res.json({
        message: `${uniqueEmails.length} valid email(s) extracted from file`,
        emails: uniqueEmails,
        total: uniqueEmails.length,
      });
    } catch (error: any) {
      console.error('CSV upload error:', error);
      res.status(500).json({ error: 'Failed to parse recipient file', details: error.message });
    }
  }
);

export default router;
