import prisma from '../config/database';
import redisConnection from '../config/redis';
import config from '../config';
import { randomUUID } from 'crypto';
import https from 'https';
import http from 'http';

const STATE_PREFIX = 'slack:oauth:state:';
const STATE_TTL_SECONDS = 600;

/**
 * Generate an unguessable `state` nonce and bind it to the user in Redis
 * (10-minute TTL).  The callback resolves the user from this nonce rather than
 * trusting a plaintext userId in the URL, which would let an attacker attach
 * their Slack webhook to any account.
 */
export async function getAuthUrl(userId: string): Promise<string> {
  const state = randomUUID();
  await redisConnection.set(`${STATE_PREFIX}${state}`, userId, 'EX', STATE_TTL_SECONDS);

  const params = new URLSearchParams({
    client_id: config.SLACK_CLIENT_ID,
    scope: 'incoming-webhook',
    redirect_uri: config.SLACK_REDIRECT_URI,
    state,
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

/** Resolve (and consume) the userId bound to an OAuth `state` nonce. */
export async function consumeOAuthState(state: string): Promise<string | null> {
  const key = `${STATE_PREFIX}${state}`;
  const userId = await redisConnection.get(key);
  if (userId) await redisConnection.del(key);
  return userId;
}

export async function handleCallback(code: string, userId: string): Promise<void> {
  const params = new URLSearchParams({
    client_id: config.SLACK_CLIENT_ID,
    client_secret: config.SLACK_CLIENT_SECRET,
    code,
    redirect_uri: config.SLACK_REDIRECT_URI,
  });

  const response = await fetch(`https://slack.com/api/oauth.v2.access?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const data = await response.json() as {
    ok: boolean;
    access_token?: string;
    incoming_webhook?: { url: string };
    team?: { name: string };
    error?: string;
  };

  if (!data.ok) {
    throw new Error(`Slack OAuth error: ${data.error || 'Unknown error'}`);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      slackToken: data.access_token || null,
      slackWebhookUrl: data.incoming_webhook?.url || null,
      slackTeamName: data.team?.name || null,
    },
  });
}

export async function sendRateLimitNotification(
  userId: string,
  senderEmail: string,
  currentCount: number,
  limit: number
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { slackWebhookUrl: true, name: true },
  });

  if (!user?.slackWebhookUrl) {
    return;
  }

  const payload = JSON.stringify({
    text: `⚠️ *Rate Limit Alert*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⚠️ *Rate Limit Reached*\n\n*Sender:* ${senderEmail}\n*Current Count:* ${currentCount}/${limit} emails this hour\n*User:* ${user.name}\n\nEmails have been automatically rescheduled to the next available window.`,
        },
      },
    ],
  });

  return new Promise<void>((resolve, reject) => {
    const url = new URL(user.slackWebhookUrl!);
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      }
    );

    req.on('error', (err) => {
      console.error('Failed to send Slack notification:', err.message);
      resolve();
    });

    req.write(payload);
    req.end();
  });
}

export async function disconnect(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      slackToken: null,
      slackWebhookUrl: null,
      slackTeamName: null,
    },
  });
}

export async function getStatus(userId: string): Promise<{
  connected: boolean;
  teamName?: string | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { slackWebhookUrl: true, slackTeamName: true },
  });

  return {
    connected: !!user?.slackWebhookUrl,
    teamName: user?.slackTeamName,
  };
}
