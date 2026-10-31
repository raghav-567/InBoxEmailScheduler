import React, { type ReactNode } from 'react';
import Sidebar from './Sidebar';

interface DashboardLayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onCompose: () => void;
  scheduledCount?: number;
  sentCount?: number;
}

export default function DashboardLayout({
  children,
  activeTab,
  onTabChange,
  onCompose,
  scheduledCount,
  sentCount,
}: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-surface-bg">
      <Sidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        onCompose={onCompose}
        scheduledCount={scheduledCount}
        sentCount={sentCount}
      />
      <main className="ml-[260px] min-h-screen">{children}</main>
    </div>
  );
}
