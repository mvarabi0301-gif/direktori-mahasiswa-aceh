import React from 'react';
import { GraduationCap, Database, ShieldCheck } from 'lucide-react';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-emerald-900/10 bg-white/95 backdrop-blur-md shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Identity & Logo */}
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-800 via-emerald-700 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-900/20 ring-2 ring-emerald-500/20">
              <GraduationCap className="w-7 h-7 text-amber-300 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight text-slate-900">
                  Direktori Mahasiswa <span className="text-emerald-700">Aceh</span>
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                  Resmi
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Pusat Basis Data & Verifikasi Akademik Mahasiswa Perguruan Tinggi di Aceh
              </p>
            </div>
          </div>

          {/* Right Badges */}
          <div className="flex items-center space-x-3">
            <div className="hidden md:flex items-center space-x-2 text-xs font-medium text-slate-600 bg-slate-100/80 px-3 py-1.5 rounded-lg border border-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Verifikasi Terbuka</span>
            </div>
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              <Database className="w-3.5 h-3.5 text-emerald-700" />
              <span>Supabase DB</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
