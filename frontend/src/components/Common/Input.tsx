import React, { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
  containerClassName?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, containerClassName = '', className = '', ...rest }, ref) => {
    return (
      <div className={containerClassName}>
        {label && (
          <label className="block text-sm font-medium text-content-primary mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-secondary">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            className={`
              w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm
              text-content-primary placeholder:text-content-secondary/60
              focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500
              transition-all duration-200
              disabled:bg-gray-50 disabled:cursor-not-allowed
              ${icon ? 'pl-10' : ''}
              ${error ? 'border-error focus:ring-error/20 focus:border-error' : ''}
              ${className}
            `}
            {...rest}
          />
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-error">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
