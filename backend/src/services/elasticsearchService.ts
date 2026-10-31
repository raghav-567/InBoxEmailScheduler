import { esClient, EMAIL_INDEX } from '../config/elasticsearch';
import { EmailJob } from '@prisma/client';
import { PaginatedResult } from '../types';
import prisma from '../config/database';

// Never send SMTP credentials (especially smtpPass) to the browser.
const senderPublicSelect = {
  id: true,
  email: true,
  smtpUser: true,
  smtpHost: true,
  smtpPort: true,
} as const;

export async function indexEmail(emailJob: EmailJob): Promise<void> {
  try {
    await esClient.index({
      index: EMAIL_INDEX,
      id: emailJob.id,
      document: {
        emailJobId: emailJob.id,
        recipient: emailJob.recipient,
        subject: emailJob.subject,
        body: emailJob.body,
        status: emailJob.status,
        scheduledAt: emailJob.scheduledAt.toISOString(),
        sentAt: emailJob.sentAt ? emailJob.sentAt.toISOString() : null,
        userId: emailJob.userId,
        batchId: emailJob.batchId,
        createdAt: emailJob.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Failed to index email in Elasticsearch:', error.message);
  }
}

/**
 * Index many email jobs in a single bulk request.  Used by the schedule
 * endpoint so that indexing a large batch is one round-trip instead of one
 * HTTP call per recipient (which would block the request for large uploads).
 */
export async function indexEmailsBulk(emailJobs: EmailJob[]): Promise<void> {
  if (emailJobs.length === 0) return;
  try {
    const operations = emailJobs.flatMap((emailJob) => [
      { index: { _index: EMAIL_INDEX, _id: emailJob.id } },
      {
        emailJobId: emailJob.id,
        recipient: emailJob.recipient,
        subject: emailJob.subject,
        body: emailJob.body,
        status: emailJob.status,
        scheduledAt: emailJob.scheduledAt.toISOString(),
        sentAt: emailJob.sentAt ? emailJob.sentAt.toISOString() : null,
        userId: emailJob.userId,
        batchId: emailJob.batchId,
        createdAt: emailJob.createdAt.toISOString(),
      },
    ]);
    await esClient.bulk({ refresh: false, operations });
  } catch (error: any) {
    console.error('Failed to bulk-index emails in Elasticsearch:', error.message);
  }
}

export async function searchEmails(
  userId: string,
  query: string,
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResult<EmailJob>> {
  try {
    const from = (page - 1) * limit;

    const result = await esClient.search({
      index: EMAIL_INDEX,
      body: {
        from,
        size: limit,
        query: {
          bool: {
            must: [
              { term: { userId } },
              {
                multi_match: {
                  query,
                  fields: ['subject^2', 'body', 'recipient'],
                  fuzziness: 'AUTO',
                },
              },
            ],
          },
        },
        sort: [{ createdAt: { order: 'desc' } }],
      },
    });

    const hits = result.hits.hits;
    const total =
      typeof result.hits.total === 'number'
        ? result.hits.total
        : result.hits.total?.value || 0;

    const emailJobIds = hits.map((hit: any) => hit._source?.emailJobId || hit._id);

    const data = emailJobIds.length > 0
      ? await prisma.emailJob.findMany({
          where: { id: { in: emailJobIds } },
          include: { sender: { select: senderPublicSelect } },
        })
      : [];

    const orderedData = emailJobIds
      .map((id: string) => data.find((job) => job.id === id))
      .filter(Boolean) as EmailJob[];

    return {
      data: orderedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error: any) {
    console.error('Elasticsearch search failed, falling back to DB:', error.message);

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

export async function deleteEmail(emailJobId: string): Promise<void> {
  try {
    await esClient.delete({
      index: EMAIL_INDEX,
      id: emailJobId,
    });
  } catch (error: any) {
    console.error('Failed to delete email from Elasticsearch:', error.message);
  }
}
