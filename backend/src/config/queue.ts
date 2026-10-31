import { Queue } from 'bullmq';
import { createRedisConnection } from './redis';

const emailQueue = new Queue('email-sends', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 5000,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

export function getEmailQueue(): Queue {
  return emailQueue;
}

export { emailQueue };
export default emailQueue;
