import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import session from 'express-session';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import config from './config';

import authRoutes from './routes/auth';
import emailRoutes from './routes/emails';
import senderRoutes from './routes/senders';
import slackRoutes from './routes/slack';

import './workers/emailWorker';

import { emailQueue } from './config/queue';

import { ensureIndex } from './config/elasticsearch';
import { reconcilePendingJobs } from './services/emailService';

const app = express();

app.use(
  cors({
    origin: config.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: config.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  // bull-board v5's public types target an older BullMQ Job progress type.
  // The adapter remains runtime-compatible with BullMQ v5; this bridge avoids
  // leaking that third-party type mismatch into the application build.
  queues: [new BullMQAdapter(emailQueue) as unknown as import('@bull-board/api/dist/src/queueAdapters/base').BaseAdapter],
  serverAdapter,
});
// Protect the BullMQ dashboard: it exposes email contents and lets anyone
// retry/remove jobs, so it must not be world-readable.
function bullBoardAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
    if (user === config.BULL_BOARD_USER && pass === config.BULL_BOARD_PASSWORD) {
      next();
      return;
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="BullMQ Dashboard"').status(401).send('Authentication required');
}

app.use('/admin/queues', bullBoardAuth, serverAdapter.getRouter());

app.use('/api/auth', authRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/senders', senderRoutes);
app.use('/api/slack', slackRoutes);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = config.PORT || 3000;

app.listen(PORT, async () => {
  await ensureIndex();
  // Make the DB the source of truth on boot: re-enqueue any pending job whose
  // BullMQ counterpart is missing from Redis (e.g. after Redis data loss).
  await reconcilePendingJobs().catch((err) =>
    console.error('Job reconciliation failed:', err.message)
  );
  console.log(`Server running on port ${PORT}`);
  console.log(`BullMQ Dashboard: http://localhost:${PORT}/admin/queues`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

export default app;
