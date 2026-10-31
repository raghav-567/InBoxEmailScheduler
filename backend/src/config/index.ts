import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),

  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://reachinbox:reachinbox123@localhost:5432/reachinbox',

  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),

  ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',

  SMTP_HOST: process.env.SMTP_HOST || 'smtp.ethereal.email',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',

  SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID || '',
  SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET || '',
  SLACK_REDIRECT_URI: process.env.SLACK_REDIRECT_URI || 'http://localhost:3000/api/slack/callback',

  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key',

  BULL_BOARD_USER: process.env.BULL_BOARD_USER || 'admin',
  BULL_BOARD_PASSWORD: process.env.BULL_BOARD_PASSWORD || 'admin',

  MAX_EMAILS_PER_HOUR: parseInt(process.env.MAX_EMAILS_PER_HOUR || '200', 10),
  MAX_EMAILS_PER_HOUR_PER_SENDER: parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || '50', 10),
  WORKER_CONCURRENCY: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
  MIN_DELAY_BETWEEN_EMAILS_MS: parseInt(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || '2000', 10),

  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
};

// Fail fast on insecure defaults in production: a forgeable JWT secret or an
// admin/admin dashboard would be a critical hole once deployed. Dev keeps the
// convenient fallbacks above.
if (process.env.NODE_ENV === 'production') {
  const insecure: string[] = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-super-secret-jwt-key') {
    insecure.push('JWT_SECRET');
  }
  if (!process.env.BULL_BOARD_PASSWORD || process.env.BULL_BOARD_PASSWORD === 'admin') {
    insecure.push('BULL_BOARD_PASSWORD');
  }
  if (insecure.length > 0) {
    throw new Error(
      `Refusing to start in production with insecure default(s): ${insecure.join(', ')}. Set strong values in the environment.`
    );
  }
}

export default config;
