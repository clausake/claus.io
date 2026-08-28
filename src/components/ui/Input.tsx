import React from "react";
import { ChevronDown } from "lucide-react";

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> {
  label?: string;
  error?: string;
  id: string;
  className?: string;
}

export function Input({ label, error, id, className = "", ...rest }: InputProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      <input
        id={id}
        className={`input ${error ? "input-error" : ""} ${className}`}
        {...rest}
      />
      {error && (
        <p className="error-msg">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  );
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "className"> {
  label?: string;
  error?: string;
  id: string;
  className?: string;
}

export function Select({ label, error, id, className = "", children, ...rest }: SelectProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          className={`input appearance-none pr-10 ${error ? "input-error" : ""} ${className}`}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-text-faint pointer-events-none" />
      </div>
      {error && (
        <p className="error-msg">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  );
}
