import React from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-white/5 rounded ${className}`}
      role="status"
      aria-label="Chargement"
    />
  );
}

export function SkeletonLine({ width = "100%" }: { width?: string }) {
  return (
    <div
      className="animate-pulse bg-white/5 rounded h-4 mb-3"
      style={{ width }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="card p-6 space-y-4">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <SkeletonLine width="80%" />
      <SkeletonLine width="60%" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="bg-surface-2 px-4 py-3 border-b border-white/5">
        <Skeleton className="h-3 w-1/4" />
      </div>
      <div className="divide-y divide-white/5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/5 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
