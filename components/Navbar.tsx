import React from 'react';
import { GraduationCap } from 'lucide-react';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Identity & Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-700 to-teal-600 flex items-center justify-center shadow-sm flex-shrink-0">
              <GraduationCap className="w-5 h-5 text-white stroke-[2]" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-slate-900">
                Direktori Mahasiswa <span className="text-emerald-700">Aceh</span>
              </span>
              <p className="text-xs text-slate-500 hidden sm:block leading-tight">
                Basis Data Akademik Perguruan Tinggi di Aceh
              </p>
            </div>
          </div>

          {/* Right: data source label */}
          <div className="text-xs text-slate-500 hidden md:block">
            Data bersumber dari <span className="font-semibold text-slate-700">PDDikti Kemdiktisaintek</span>
          </div>
        </div>
      </div>
    </header>
  );
}
