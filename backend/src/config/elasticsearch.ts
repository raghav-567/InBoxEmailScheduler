import { Client } from '@elastic/elasticsearch';
import config from './index';

const esClient = new Client({
  node: config.ELASTICSEARCH_URL,
});

const EMAIL_INDEX = 'emails';

export async function ensureIndex(): Promise<void> {
  try {
    const indexExists = await esClient.indices.exists({ index: EMAIL_INDEX });

    if (!indexExists) {
      await esClient.indices.create({
        index: EMAIL_INDEX,
        body: {
          mappings: {
            properties: {
              emailJobId: { type: 'keyword' },
              recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              subject: { type: 'text' },
              body: { type: 'text' },
              status: { type: 'keyword' },
              scheduledAt: { type: 'date' },
              sentAt: { type: 'date' },
              userId: { type: 'keyword' },
              batchId: { type: 'keyword' },
              senderEmail: { type: 'keyword' },
              createdAt: { type: 'date' },
            },
          },
        },
      });
      console.log(`Elasticsearch index "${EMAIL_INDEX}" created`);
    } else {
      console.log(`Elasticsearch index "${EMAIL_INDEX}" already exists`);
    }
  } catch (error: any) {
    console.error('Failed to ensure Elasticsearch index:', error.message);
    console.warn('Elasticsearch may not be available. Email search will be degraded.');
  }
}

export { esClient, EMAIL_INDEX };
export default esClient;
