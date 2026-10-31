import React, { useState, useEffect, useCallback } from 'react';
import { Search, SlidersHorizontal, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/Layout/DashboardLayout';
import EmailList from '../components/Dashboard/EmailList';
import ComposeModal from '../components/Compose/ComposeModal';
import {
  getEmailStats,
  getScheduledEmails,
  getSentEmails,
  searchEmails,
} from '../services/api';
import type { EmailJob, EmailStats } from '../types';

type ViewTab = 'scheduled' | 'sent';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<ViewTab>('scheduled');
  const [stats, setStats] = useState<EmailStats | null>(null);

  const [scheduledEmails, setScheduledEmails] = useState<EmailJob[]>([]);
  const [scheduledPage, setScheduledPage] = useState(1);
  const [scheduledTotalPages, setScheduledTotalPages] = useState(1);
  const [scheduledLoading, setScheduledLoading] = useState(true);

  const [sentEmails, setSentEmails] = useState<EmailJob[]>([]);
  const [sentPage, setSentPage] = useState(1);
  const [sentTotalPages, setSentTotalPages] = useState(1);
  const [sentLoading, setSentLoading] = useState(true);

  const [composeOpen, setComposeOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EmailJob[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      setStats(await getEmailStats());
    } catch {
      /* silent */
    }
  }, []);

  const fetchScheduled = useCallback(async (page: number) => {
    setScheduledLoading(true);
    try {
      const res = await getScheduledEmails(page, 20);
      setScheduledEmails(res.data);
      setScheduledTotalPages(res.totalPages);
    } catch {
      toast.error('Failed to load scheduled emails');
    } finally {
      setScheduledLoading(false);
    }
  }, []);

  const fetchSent = useCallback(async (page: number) => {
    setSentLoading(true);
    try {
      const res = await getSentEmails(page, 20);
      setSentEmails(res.data);
      setSentTotalPages(res.totalPages);
    } catch {
      toast.error('Failed to load sent emails');
    } finally {
      setSentLoading(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    fetchStats();
    fetchScheduled(scheduledPage);
    fetchSent(sentPage);
  }, [fetchStats, fetchScheduled, fetchSent, scheduledPage, sentPage]);

  useEffect(() => {
    fetchStats();
    fetchScheduled(1);
    fetchSent(1);
  }, [fetchStats, fetchScheduled, fetchSent]);

  useEffect(() => {
    const interval = setInterval(refreshAll, 30000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    refreshAll();
    setTimeout(() => setRefreshing(false), 600);
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      setSearchResults(await searchEmails(searchQuery));
    } catch {
      toast.error('Search failed');
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as ViewTab);
    clearSearch();
  };

  const renderList = () => {
    if (searchResults !== null) {
      return (
        <div>
          <div className="flex items-center justify-between px-5 pb-3">
            <p className="text-sm text-content-secondary">
              {searchResults.length} result{searchResults.length === 1 ? '' : 's'} for
              “{searchQuery}”
            </p>
            <button
              onClick={clearSearch}
              className="flex items-center gap-1 text-sm text-content-secondary hover:text-content-primary"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          </div>
          <EmailList
            data={searchResults}
            type={activeTab === 'sent' ? 'sent' : 'scheduled'}
            loading={false}
            currentPage={1}
            totalPages={1}
            onPageChange={() => {}}
          />
        </div>
      );
    }

    if (activeTab === 'sent') {
      return (
        <EmailList
          data={sentEmails}
          type="sent"
          loading={sentLoading}
          currentPage={sentPage}
          totalPages={sentTotalPages}
          onPageChange={(p) => {
            setSentPage(p);
            fetchSent(p);
          }}
        />
      );
    }

    return (
      <EmailList
        data={scheduledEmails}
        type="scheduled"
        loading={scheduledLoading}
        currentPage={scheduledPage}
        totalPages={scheduledTotalPages}
        onPageChange={(p) => {
          setScheduledPage(p);
          fetchScheduled(p);
        }}
        onCompose={() => setComposeOpen(true)}
      />
    );
  };

  return (
    <DashboardLayout
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onCompose={() => setComposeOpen(true)}
      scheduledCount={stats?.scheduled}
      sentCount={stats?.sent}
    >
      {/* Search / actions bar */}
      <div className="sticky top-0 bg-white z-10 px-6 pt-6 pb-4 border-b border-border">
        <div className="flex items-center gap-2">
          <form onSubmit={handleSearchSubmit} className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-surface-subtle rounded-xl text-sm text-content-primary placeholder:text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </form>
          <button
            type="button"
            className="p-3 rounded-xl text-content-secondary hover:bg-surface-subtle transition-colors"
            title="Filter"
          >
            <SlidersHorizontal className="w-[18px] h-[18px]" />
          </button>
          <button
            type="button"
            onClick={handleManualRefresh}
            className="p-3 rounded-xl text-content-secondary hover:bg-surface-subtle transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-[18px] h-[18px] ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="py-2">{renderList()}</div>

      <ComposeModal
        isOpen={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSuccess={refreshAll}
      />
    </DashboardLayout>
  );
}
