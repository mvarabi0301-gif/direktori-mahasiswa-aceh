import React from 'react';

export default function LoadingSkeleton() {
  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-pulse space-y-4">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="h-4 bg-slate-200 rounded w-1/4"></div>
        <div className="h-4 bg-slate-200 rounded w-24"></div>
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center space-x-4 py-2">
            <div className="w-6 h-6 bg-slate-200 rounded"></div>
            <div className="w-9 h-9 bg-slate-200 rounded-lg"></div>
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-slate-200 rounded w-1/3"></div>
              <div className="h-3 bg-slate-100 rounded w-1/4"></div>
            </div>
            <div className="h-4 bg-slate-200 rounded w-1/4 hidden md:block"></div>
            <div className="h-4 bg-slate-200 rounded w-20"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
