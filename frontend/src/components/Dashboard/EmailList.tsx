import React from 'react';
import { format } from 'date-fns';
import { Clock, Star, Inbox } from 'lucide-react';
import type { EmailJob } from '../../types';
import Pagination from '../Common/Pagination';
import EmptyState from '../Common/EmptyState';

interface EmailListProps {
  data: EmailJob[];
  type: 'scheduled' | 'sent';
  loading: boolean;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onCompose?: () => void;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function StatusPill({ email }: { email: EmailJob }) {
  if (email.status === 'SENT') {
    return (
      <span className="inline-flex items-center rounded-full bg-sent-bg px-2.5 py-1 text-xs font-medium text-sent-fg">
        Sent
      </span>
    );
  }
  if (email.status === 'FAILED') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-error">
        Failed
      </span>
    );
  }
  if (email.status === 'SENDING') {
    return (
      <span className="inline-flex items-center rounded-full bg-sent-bg px-2.5 py-1 text-xs font-medium text-sent-fg">
        Sending
      </span>
    );
  }
  // SCHEDULED / QUEUED / RATE_LIMITED — show the scheduled time
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-schedule-bg px-2.5 py-1 text-xs font-medium text-schedule-fg">
      <Clock className="w-3 h-3" />
      {format(new Date(email.scheduledAt), 'EEE h:mm:ss a')}
    </span>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-border animate-pulse">
      <div className="h-4 w-32 bg-gray-200 rounded" />
      <div className="h-6 w-28 bg-gray-200 rounded-full" />
      <div className="h-4 flex-1 bg-gray-200 rounded" />
    </div>
  );
}

export default function EmailList({
  data,
  type,
  loading,
  currentPage,
  totalPages,
  onPageChange,
  onCompose,
}: EmailListProps) {
  if (loading) {
    return (
      <div>
        {Array.from({ length: 6 }).map((_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="pt-16">
        <EmptyState
          icon={<Inbox className="w-8 h-8 text-content-secondary" />}
          title={type === 'scheduled' ? 'No scheduled emails yet' : 'No sent emails yet'}
          description={
            type === 'scheduled'
              ? "Click 'Compose' to schedule your first email campaign."
              : 'Emails will appear here once they have been sent.'
          }
          actionLabel={type === 'scheduled' ? 'Compose' : undefined}
          onAction={type === 'scheduled' ? onCompose : undefined}
        />
      </div>
    );
  }

  return (
    <div>
      <div>
        {data.map((email) => {
          const preview = stripHtml(email.body);
          return (
            <div
              key={email.id}
              className="group flex items-center gap-4 px-5 py-4 border-b border-border hover:bg-surface-subtle/60 transition-colors cursor-pointer"
            >
              <div className="w-[150px] flex-shrink-0 text-sm font-medium text-content-primary truncate">
                To: {email.recipient}
              </div>
              <div className="w-[150px] flex-shrink-0">
                <StatusPill email={email} />
              </div>
              <div className="flex-1 min-w-0 text-sm truncate">
                <span className="font-semibold text-content-primary">
                  {email.subject}
                </span>
                {preview && (
                  <span className="text-content-secondary"> - {preview}</span>
                )}
              </div>
              <Star className="w-4 h-4 text-content-secondary/40 group-hover:text-content-secondary flex-shrink-0" />
            </div>
          );
        })}
      </div>
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
