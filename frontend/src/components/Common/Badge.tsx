import React from 'react';

type BadgeVariant =
  | 'SCHEDULED'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'RATE_LIMITED'
  | 'info'
  | 'success'
  | 'warning'
  | 'error';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  SCHEDULED: 'bg-blue-50 text-blue-700 border-blue-200',
  QUEUED: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  SENDING: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  SENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
  RATE_LIMITED: 'bg-orange-50 text-orange-700 border-orange-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  error: 'bg-red-50 text-red-700 border-red-200',
};

const dotStyles: Record<BadgeVariant, string> = {
  SCHEDULED: 'bg-blue-500',
  QUEUED: 'bg-yellow-500',
  SENDING: 'bg-indigo-500',
  SENT: 'bg-emerald-500',
  FAILED: 'bg-red-500',
  RATE_LIMITED: 'bg-orange-500',
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-yellow-500',
  error: 'bg-red-500',
};

export default function Badge({ variant, children, className = '' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
        border ${variantStyles[variant]} ${className}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[variant]}`} />
      {children}
    </span>
  );
}
