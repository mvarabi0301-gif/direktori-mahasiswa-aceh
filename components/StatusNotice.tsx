import React from 'react';
import { Info, AlertCircle, Database } from 'lucide-react';

export default function StatusNotice() {
  return (
    <div className="w-full bg-slate-900 text-slate-200 rounded-2xl p-5 border border-slate-800 shadow-md my-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="w-9 h-9 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Info className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-white flex items-center space-x-2">
              <span>Transparansi Data & Batasan Teknis API PDDikti</span>
              <span className="text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded-full">
                Terverifikasi
              </span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
              Data yang ditampilkan pada direktori ini bersumber dari sinkronisasi server-side resmi ke PDDikti yang disimpan pada basis data Supabase PostgreSQL. Berdasarkan pengujian diagnostik teknis empiris, endpoint pencarian publik PDDikti memiliki batas keras (<em>hard cap</em>) 100 data per permintaan tanpa mekanisme paginasi massal. Direktori ini <strong>tidak mengarang atau menampilkan angka total mahasiswa fiktif</strong> yang belum terverifikasi secara teknis.
            </p>
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center space-x-2 text-xs font-mono text-slate-400 bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700/60">
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span>PostgreSQL Indexed</span>
        </div>
      </div>
    </div>
  );
}
