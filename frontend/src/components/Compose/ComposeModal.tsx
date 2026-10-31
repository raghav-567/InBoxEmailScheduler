import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Paperclip,
  Clock,
  Upload,
  X,
  Plus,
  Calendar,
  Undo2,
  Redo2,
  Type,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Papa from 'papaparse';
import {
  scheduleEmails,
  getSenders,
  createSender,
  uploadCsv,
} from '../../services/api';
import type { Sender } from '../../types';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toLocalInput(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

const TOOLBAR = [Undo2, Redo2, Type, Bold, Italic, Underline, AlignLeft, List, ListOrdered, Quote, Strikethrough];

export default function ComposeModal({ isOpen, onClose, onSuccess }: ComposeModalProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [fileName, setFileName] = useState('');
  const [senderId, setSenderId] = useState('');
  const [senders, setSenders] = useState<Sender[]>([]);
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [maxPerHour, setMaxPerHour] = useState(50);
  const [scheduledAt, setScheduledAt] = useState('');
  const [showSendLater, setShowSendLater] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingSenders, setLoadingSenders] = useState(false);
  const [creatingSender, setCreatingSender] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendLaterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoadingSenders(true);
    getSenders()
      .then((data) => {
        setSenders(data);
        if (data.length > 0) setSenderId((prev) => prev || data[0].id);
      })
      .catch(() => toast.error('Failed to load senders'))
      .finally(() => setLoadingSenders(false));
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sendLaterRef.current && !sendLaterRef.current.contains(e.target as Node)) {
        setShowSendLater(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const reset = useCallback(() => {
    setSubject('');
    setBody('');
    setRecipients([]);
    setRecipientInput('');
    setFileName('');
    setDelaySeconds(2);
    setMaxPerHour(50);
    setScheduledAt('');
    setShowSendLater(false);
  }, []);

  const addRecipient = (value: string) => {
    const email = value.trim().replace(/[,;]$/, '');
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      toast.error(`Invalid email: ${email}`);
      return;
    }
    setRecipients((prev) => (prev.includes(email) ? prev : [...prev, email]));
    setRecipientInput('');
  };

  const handleRecipientKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      e.preventDefault();
      addRecipient(recipientInput);
    } else if (e.key === 'Backspace' && !recipientInput && recipients.length) {
      setRecipients((prev) => prev.slice(0, -1));
    }
  };

  const handleFileUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'txt') {
      toast.error('Please upload a CSV or TXT file');
      return;
    }
    setFileName(file.name);
    try {
      const uploaded = await uploadCsv(file);
      if (Array.isArray(uploaded) && uploaded.length > 0) {
        setRecipients((prev) => [...new Set([...prev, ...uploaded])]);
        toast.success(`${uploaded.length} email addresses detected`);
        return;
      }
    } catch {
      /* fall through to local parsing */
    }
    const text = await file.text();
    Papa.parse(text, {
      complete: (results) => {
        const emails: string[] = [];
        results.data.forEach((row: unknown) => {
          if (Array.isArray(row)) {
            row.forEach((cell: unknown) => {
              const val = String(cell).trim();
              if (EMAIL_RE.test(val)) emails.push(val);
            });
          }
        });
        const unique = [...new Set(emails)];
        if (unique.length > 0) {
          setRecipients((prev) => [...new Set([...prev, ...unique])]);
          toast.success(`${unique.length} email addresses detected`);
        } else {
          toast.error('No valid email addresses found in the file');
        }
      },
      error: () => toast.error('Failed to parse the file'),
    });
  };

  const handleCreateSender = async () => {
    setCreatingSender(true);
    try {
      const sender = await createSender();
      setSenders((prev) => [...prev, sender]);
      setSenderId(sender.id);
      toast.success(`New sender created: ${sender.email}`);
    } catch {
      toast.error('Failed to create sender');
    } finally {
      setCreatingSender(false);
    }
  };

  const submit = async () => {
    const all = recipientInput.trim()
      ? [...recipients, recipientInput.trim()].filter((e) => EMAIL_RE.test(e))
      : recipients;

    if (!subject.trim()) return toast.error('Please enter a subject');
    if (!body.trim()) return toast.error('Please enter a message body');
    if (all.length === 0) return toast.error('Please add at least one recipient');
    if (!senderId) return toast.error('Please select a sender');

    setSubmitting(true);
    try {
      await scheduleEmails({
        subject: subject.trim(),
        body: body.trim(),
        recipients: [...new Set(all)],
        senderId,
        scheduledAt: scheduledAt
          ? new Date(scheduledAt).toISOString()
          : new Date().toISOString(),
        delayBetweenEmails: Math.round(Math.max(0, delaySeconds) * 1000),
        maxPerHour,
      });
      toast.success(`${new Set(all).size} email(s) scheduled successfully!`);
      reset();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to schedule emails';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const quickPick = (opt: 'tom' | 'tom10' | 'tom11' | 'tom15') => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    if (opt === 'tom10') d.setHours(10, 0, 0, 0);
    else if (opt === 'tom11') d.setHours(11, 0, 0, 0);
    else if (opt === 'tom15') d.setHours(15, 0, 0, 0);
    else d.setHours(9, 0, 0, 0);
    setScheduledAt(toLocalInput(d));
  };

  if (!isOpen) return null;

  const visibleChips = recipients.slice(0, 8);
  const extraChips = recipients.length - visibleChips.length;
  const actionLabel = scheduledAt ? 'Send Later' : 'Send';

  const labelCls = 'text-sm text-content-secondary w-[90px] flex-shrink-0 pt-2';
  const underlineField =
    'flex-1 border-b border-border py-2 text-sm text-content-primary placeholder:text-content-secondary focus:outline-none focus:border-primary-500 transition-colors';

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto scrollbar-thin">
      <div className="max-w-[1080px] mx-auto px-6 sm:px-10 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-content-primary hover:bg-surface-subtle transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-2xl font-bold text-content-primary">Compose New Email</h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative p-2 rounded-lg text-content-secondary hover:bg-surface-subtle transition-colors"
              title="Attach recipient list"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <div className="relative" ref={sendLaterRef}>
              <button
                onClick={() => setShowSendLater((o) => !o)}
                className={`p-2 rounded-lg transition-colors ${
                  scheduledAt
                    ? 'text-primary-600 bg-primary-50'
                    : 'text-content-secondary hover:bg-surface-subtle'
                }`}
                title="Schedule send"
              >
                <Clock className="w-5 h-5" />
              </button>

              {showSendLater && (
                <div className="absolute right-0 top-full mt-2 w-[320px] bg-white rounded-xl border border-border shadow-xl p-4 z-50">
                  <p className="text-sm font-semibold text-content-primary mb-3">
                    Send Later
                  </p>
                  <div className="relative mb-3">
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="w-full border-b border-border py-2 pr-7 text-sm text-content-primary focus:outline-none focus:border-primary-500"
                    />
                    <Calendar className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary pointer-events-none" />
                  </div>
                  <div className="space-y-1 mb-3">
                    {[
                      ['Tomorrow', 'tom'],
                      ['Tomorrow, 10:00 AM', 'tom10'],
                      ['Tomorrow, 11:00 AM', 'tom11'],
                      ['Tomorrow, 3:00 PM', 'tom15'],
                    ].map(([label, key]) => (
                      <button
                        key={key}
                        onClick={() => quickPick(key as 'tom')}
                        className="w-full text-left text-sm text-content-primary px-2 py-1.5 rounded-md hover:bg-surface-subtle"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        setScheduledAt('');
                        setShowSendLater(false);
                      }}
                      className="text-sm text-content-secondary px-3 py-1.5 hover:text-content-primary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setShowSendLater(false)}
                      className="text-sm font-medium text-primary-600 border border-primary-500 rounded-full px-4 py-1.5 hover:bg-primary-50"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={submit}
              disabled={submitting}
              className="text-sm font-semibold text-primary-600 border border-primary-500 rounded-full px-6 py-2 hover:bg-primary-50 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Sending…' : actionLabel}
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
          }}
        />

        {/* Form */}
        <div className="space-y-5">
          {/* From */}
          <div className="flex items-start gap-4">
            <span className={labelCls}>From</span>
            <div className="flex items-center gap-2">
              <select
                value={senderId}
                onChange={(e) => setSenderId(e.target.value)}
                disabled={loadingSenders}
                className="rounded-lg bg-surface-subtle px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-60"
              >
                {senders.length === 0 && (
                  <option value="">
                    {loadingSenders ? 'Loading…' : 'No senders'}
                  </option>
                )}
                {senders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.email}
                  </option>
                ))}
              </select>
              <button
                onClick={handleCreateSender}
                disabled={creatingSender}
                className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {creatingSender ? 'Creating…' : 'New'}
              </button>
            </div>
          </div>

          {/* To */}
          <div className="flex items-start gap-4">
            <span className={labelCls}>To</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-3">
                <div className="flex-1 flex flex-wrap items-center gap-2 border-b border-border py-2 min-h-[40px]">
                  {visibleChips.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1.5 rounded-full border border-primary-400 bg-primary-50 px-2.5 py-1 text-xs text-primary-700"
                    >
                      {email}
                      <button
                        onClick={() =>
                          setRecipients((prev) => prev.filter((r) => r !== email))
                        }
                        className="hover:text-primary-900"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {extraChips > 0 && (
                    <span className="inline-flex items-center rounded-full border border-border px-2.5 py-1 text-xs text-content-secondary">
                      +{extraChips}
                    </span>
                  )}
                  <input
                    value={recipientInput}
                    onChange={(e) => setRecipientInput(e.target.value)}
                    onKeyDown={handleRecipientKey}
                    onBlur={() => recipientInput && addRecipient(recipientInput)}
                    placeholder={recipients.length ? '' : 'recipient@example.com'}
                    className="flex-1 min-w-[160px] text-sm text-content-primary placeholder:text-content-secondary focus:outline-none bg-transparent"
                  />
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 pt-2 flex-shrink-0"
                >
                  <Upload className="w-4 h-4" />
                  Upload List
                </button>
              </div>
              {fileName && (
                <p className="mt-1 text-xs text-content-secondary">
                  {fileName} · {recipients.length} recipients
                </p>
              )}
            </div>
          </div>

          {/* Subject */}
          <div className="flex items-start gap-4">
            <span className={labelCls}>Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className={underlineField}
            />
          </div>

          {/* Delay + Hourly limit */}
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm text-content-secondary">Delay between 2 emails (s)</span>
              <input
                type="number"
                min={0}
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
                placeholder="00"
                className="w-20 rounded-lg border border-border px-3 py-2 text-sm text-content-primary focus:outline-none focus:border-primary-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-content-secondary">Hourly Limit</span>
              <input
                type="number"
                min={1}
                value={maxPerHour}
                onChange={(e) => setMaxPerHour(Number(e.target.value))}
                placeholder="00"
                className="w-20 rounded-lg border border-border px-3 py-2 text-sm text-content-primary focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* Body + toolbar */}
          <div className="rounded-xl bg-surface-subtle/70 border border-border overflow-hidden">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type Your Reply..."
              rows={12}
              className="w-full bg-transparent px-5 pt-4 pb-2 text-sm text-content-primary placeholder:text-content-secondary focus:outline-none resize-y"
            />
            <div className="flex items-center gap-1 px-4 py-2.5 border-t border-border/70 flex-wrap">
              {TOOLBAR.map((Icon, i) => (
                <span
                  key={i}
                  className="p-1.5 rounded-md text-content-secondary"
                  aria-hidden
                >
                  <Icon className="w-4 h-4" />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
