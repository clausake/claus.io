import React from "react";

interface TableProps {
  children: React.ReactNode;
  className?: string;
  minWidth?: string;
}

export function Table({ children, className = "", minWidth = "640px" }: TableProps) {
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className={`table w-full text-sm ${className}`} style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}
