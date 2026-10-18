import React from 'react';
import { Search, Database, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';

interface EmptyStateProps {
  type: 'initial' | 'not-found' | 'unconfigured' | 'error';
  message?: string;
  onReset?: () => void;
  onRetry?: () => void;
  onFallback?: () => void;
  fallbackLabel?: string;
}

export default function EmptyState({
  type,
  message,
  onReset,
  onRetry,
  onFallback,
  fallbackLabel,
}: EmptyStateProps) {
  if (type === 'unconfigured') {
    return (
      <div className="w-full bg-white rounded-2xl border border-amber-200/80 p-8 sm:p-12 text-center shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <Database className="w-8 h-8 stroke-[1.8]" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">
          Basis Data Supabase Belum Dikonfigurasi
        </h3>
        <p className="text-sm text-slate-600 max-w-lg mx-auto mb-6 leading-relaxed">
          {message ||
            'Aplikasi membutuhkan kredensial Supabase PostgreSQL untuk menyimpan dan menampilkan data mahasiswa secara aman.'}
        </p>
        <div className="bg-slate-50 rounded-xl p-4 max-w-md mx-auto text-left text-xs font-mono text-slate-700 border border-slate-200 mb-6 space-y-1">
          <p className="font-semibold text-slate-900 font-sans mb-1">Langkah Konfigurasi:</p>
          <p>1. Salin .env.example menjadi .env.local</p>
          <p>2. Isi NEXT_PUBLIC_SUPABASE_URL & ANON_KEY</p>
          <p>3. Jalankan migration dari supabase/schema.sql</p>
          <p>4. Jalankan sinkronisasi bertarget: npm run sync</p>
        </div>
      </div>
    );
  }

  if (type === 'error') {
    return (
      <div className="w-full bg-white rounded-2xl border border-red-200 p-8 sm:p-12 text-center shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 stroke-[1.8]" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">
          Terjadi Kesalahan Saat Menghubungi API PDDikti
        </h3>
        <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
          {message || 'Tidak dapat terhubung ke server PDDikti Kemdiktisaintek saat ini.'}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-sm transition"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Coba Lagi ke PDDikti</span>
            </button>
          )}
          {onFallback && (
            <button
              type="button"
              onClick={onFallback}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm transition"
            >
              <span>{fallbackLabel || 'Cari di Arsip Database (100.507 Mahasiswa)'}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  if (type === 'not-found') {
    return (
      <div className="w-full bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
          <Search className="w-8 h-8 stroke-[1.8]" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-1.5">
          Tidak Ada Data Mahasiswa yang Cocok
        </h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
          Kriteria pencarian atau filter yang Anda terapkan tidak menghasilkan data mahasiswa di basis data saat ini.
        </p>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Kriteria Pencarian</span>
          </button>
        )}
      </div>
    );
  }

  // Initial State
  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200/90 p-8 sm:p-12 text-center shadow-sm">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-4">
        <Sparkles className="w-8 h-8 stroke-[1.8]" />
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-2">
        Mulai Pencarian Mahasiswa Aceh
      </h3>
      <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
        Gunakan kolom pencarian di atas untuk memasukkan Nama Mahasiswa atau NIM, atau pilih perguruan tinggi untuk menelusuri mahasiswa pada kampus tertentu.
      </p>
    </div>
  );
}
