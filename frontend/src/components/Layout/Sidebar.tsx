import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  Send,
  MessageSquare,
  ChevronDown,
  LogOut,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import {
  disconnectSlack,
  getSlackAuthUrl,
  getSlackStatus,
} from '../../services/api';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onCompose: () => void;
  scheduledCount?: number;
  sentCount?: number;
}

export default function Sidebar({
  activeTab,
  onTabChange,
  onCompose,
  scheduledCount,
  sentCount,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const [slackConnected, setSlackConnected] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSlackStatus()
      .then((status) => setSlackConnected(status.connected))
      .catch(() => setSlackConnected(false));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSlackAction = async () => {
    if (!slackConnected) {
      try {
        const authUrl = await getSlackAuthUrl();
        window.location.href = authUrl;
      } catch {
        toast.error('Failed to start Slack connection');
      }
      return;
    }
    try {
      await disconnectSlack();
      setSlackConnected(false);
      toast.success('Slack disconnected');
    } catch {
      toast.error('Failed to disconnect Slack');
    }
  };

  const coreItems = [
    {
      key: 'scheduled',
      label: 'Scheduled',
      icon: <Clock className="w-[18px] h-[18px]" />,
      count: scheduledCount,
    },
    {
      key: 'sent',
      label: 'Sent',
      icon: <Send className="w-[18px] h-[18px]" />,
      count: sentCount,
    },
  ];

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[260px] bg-white border-r border-border flex flex-col z-30">
      {/* Logo */}
      <div className="px-6 pt-7 pb-5">
        <span className="font-mono text-[28px] font-extrabold tracking-tight text-content-primary">
          ONB
        </span>
      </div>

      {/* User card */}
      <div className="px-4" ref={menuRef}>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="w-full flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 hover:bg-surface-subtle transition-colors"
          >
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-9 h-9 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-semibold">
                  {user?.name?.charAt(0).toUpperCase() ?? 'U'}
                </span>
              </div>
            )}
            <div className="text-left min-w-0 flex-1">
              <p className="text-sm font-semibold text-content-primary truncate leading-tight">
                {user?.name ?? 'User'}
              </p>
              <p className="text-xs text-content-secondary truncate leading-tight">
                {user?.email ?? ''}
              </p>
            </div>
            <ChevronDown className="w-4 h-4 text-content-secondary flex-shrink-0" />
          </button>

          {menuOpen && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl border border-border shadow-lg py-1.5 z-40">
              <button
                onClick={logout}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-error hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Compose */}
      <div className="px-4 pt-3">
        <button
          onClick={onCompose}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-primary-500 px-4 py-2.5 text-sm font-semibold text-primary-600 hover:bg-primary-50 transition-colors"
        >
          Compose
        </button>
      </div>

      {/* Core nav */}
      <nav className="flex-1 px-3 pt-5 overflow-y-auto scrollbar-thin">
        <p className="px-3 pb-2 text-[11px] font-semibold text-content-secondary uppercase tracking-wider">
          Core
        </p>
        {coreItems.map((item) => {
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              className={`sidebar-link w-full justify-between ${
                active ? 'sidebar-link-active' : 'sidebar-link-inactive'
              }`}
            >
              <span className="flex items-center gap-3">
                {item.icon}
                {item.label}
              </span>
              {typeof item.count === 'number' && (
                <span
                  className={`text-xs ${
                    active ? 'text-primary-600 font-semibold' : 'text-content-secondary'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Slack integration */}
      <div className="px-3 pb-4">
        <div className="p-3.5 bg-surface-subtle rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-content-secondary" />
            <span className="text-xs font-semibold text-content-primary">
              Slack
            </span>
            <span
              className={`ml-auto w-2 h-2 rounded-full ${
                slackConnected ? 'bg-primary-500' : 'bg-content-secondary/40'
              }`}
            />
          </div>
          <button
            onClick={handleSlackAction}
            className={`w-full text-xs font-medium py-2 px-3 rounded-lg transition-colors ${
              slackConnected
                ? 'bg-white border border-border text-content-primary hover:bg-gray-50'
                : 'bg-primary-500 text-white hover:bg-primary-600'
            }`}
          >
            {slackConnected ? 'Disconnect Slack' : 'Connect Slack'}
          </button>
        </div>
      </div>
    </aside>
  );
}
