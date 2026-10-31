import redisConnection from '../config/redis';
import config from '../config';
import { RateLimitResult } from '../types';

function getCurrentHourWindow(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
}

function getWindowResetTime(): Date {
  const now = new Date();
  const resetAt = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours() + 1,
    0,
    0,
    0
  ));
  return resetAt;
}

function getWindowTtlSeconds(resetAt: Date): number {
  return Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
}

export async function checkRateLimit(
  senderEmail: string,
  requestedSenderLimit?: number
): Promise<RateLimitResult> {
  const window = getCurrentHourWindow();
  const senderKey = `ratelimit:${senderEmail}:${window}`;
  const globalKey = `ratelimit:global:${window}`;
  const resetAt = getWindowResetTime();

  const senderLimit = Math.min(
    requestedSenderLimit ?? config.MAX_EMAILS_PER_HOUR_PER_SENDER,
    config.MAX_EMAILS_PER_HOUR_PER_SENDER
  );
  const result = (await redisConnection.eval(
    `local senderCount = redis.call('INCR', KEYS[1])
     if senderCount == 1 then redis.call('EXPIRE', KEYS[1], ARGV[3]) end
     local globalCount = redis.call('INCR', KEYS[2])
     if globalCount == 1 then redis.call('EXPIRE', KEYS[2], ARGV[3]) end
     if senderCount > tonumber(ARGV[1]) or globalCount > tonumber(ARGV[2]) then
       redis.call('DECR', KEYS[1])
       redis.call('DECR', KEYS[2])
       return { 0, senderCount - 1, globalCount - 1 }
     end
     return { 1, senderCount, globalCount }`,
    2,
    senderKey,
    globalKey,
    senderLimit,
    config.MAX_EMAILS_PER_HOUR,
    getWindowTtlSeconds(resetAt)
  )) as [number, number, number];

  const [allowed, senderCount, globalCount] = result;
  const senderLimitExceeded = senderCount >= senderLimit;
  const globalLimitExceeded = globalCount >= config.MAX_EMAILS_PER_HOUR;

  if (!allowed) {
    const limit = senderLimitExceeded ? senderLimit : config.MAX_EMAILS_PER_HOUR;
    const currentCount = senderLimitExceeded ? senderCount : globalCount;

    return {
      allowed: false,
      currentCount,
      limit,
      resetAt,
    };
  }

  return {
    allowed: true,
    currentCount: senderCount,
    limit: senderLimit,
    resetAt,
  };
}

/**
 * Return a previously consumed slot to the current hour window.
 *
 * `checkRateLimit` atomically increments the sender + global counters when it
 * grants a slot.  If the actual send then fails, that slot was never really
 * used — without releasing it, every BullMQ retry would burn an additional
 * slot and the hourly counters would drift above the number of emails sent.
 * The DECR is floored at zero so a release can never push a counter negative.
 */
export async function releaseRateLimit(senderEmail: string): Promise<void> {
  const window = getCurrentHourWindow();
  const senderKey = `ratelimit:${senderEmail}:${window}`;
  const globalKey = `ratelimit:global:${window}`;

  try {
    await redisConnection.eval(
      `local s = redis.call('DECR', KEYS[1])
       if s < 0 then redis.call('SET', KEYS[1], 0) end
       local g = redis.call('DECR', KEYS[2])
       if g < 0 then redis.call('SET', KEYS[2], 0) end
       return 1`,
      2,
      senderKey,
      globalKey
    );
  } catch (err: any) {
    console.error('Failed to release rate-limit slot:', err.message);
  }
}

export async function getNextAvailableWindow(
  senderEmail: string,
  requestedSenderLimit?: number
): Promise<Date> {
  const window = getCurrentHourWindow();
  const senderKey = `ratelimit:${senderEmail}:${window}`;
  const globalKey = `ratelimit:global:${window}`;

  const [senderCount, globalCount] = await redisConnection.mget(senderKey, globalKey);
  const senderLimit = Math.min(
    requestedSenderLimit ?? config.MAX_EMAILS_PER_HOUR_PER_SENDER,
    config.MAX_EMAILS_PER_HOUR_PER_SENDER
  );
  const count = parseInt(senderCount || '0', 10);
  const total = parseInt(globalCount || '0', 10);

  if (count < senderLimit && total < config.MAX_EMAILS_PER_HOUR) {
    return new Date();
  }

  return getWindowResetTime();
}
