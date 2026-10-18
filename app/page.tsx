'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import SearchFilterBar from '@/components/SearchFilterBar';
import StudentTable from '@/components/StudentTable';
import Pagination from '@/components/Pagination';
import StatusNotice from '@/components/StatusNotice';
import EmptyState from '@/components/EmptyState';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { Institution, StudentPublic, StudentQueryResult } from '@/lib/types';

// Extended result type to accommodate gatewayFailed field from API
interface ExtendedStudentQueryResult extends StudentQueryResult {
  gatewayFailed?: string;
}

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCampus, setSelectedCampus] = useState<Institution | null>(null);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const [students, setStudents] = useState<StudentPublic[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isConfigured, setIsConfigured] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);

  const [resultSource, setResultSource] = useState<'pddikti_live' | 'supabase_db'>('supabase_db');
  const [isCapped, setIsCapped] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  // gatewayFailed: truthy when auto-fallback happened (live API failed)
  const [gatewayFailed, setGatewayFailed] = useState<string | null>(null);

  const fetchStudents = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setGatewayFailed(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (selectedCampus?.kode_pt) {
        params.set('kode_pt', selectedCampus.kode_pt);
        if (selectedCampus.nama) params.set('nama_pt', selectedCampus.nama);
      }
      if (selectedYear) params.set('tahun_masuk', selectedYear);
      if (selectedStatus) params.set('status', selectedStatus);
      params.set('page', String(currentPage));
      params.set('page_size', String(pageSize));

      const res = await fetch(`/api/students?${params.toString()}`);

      // 503 → both live and DB failed → genuine error, show error state
      if (res.status === 503) {
        const errorJson = await res.json().catch(() => null);
        throw new Error(errorJson?.message || 'Layanan pencarian tidak tersedia saat ini. Coba lagi beberapa saat.');
      }

      // Any other non-ok status
      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        throw new Error(errorJson?.message || errorJson?.error || `Server merespons status ${res.status}`);
      }

      const result: ExtendedStudentQueryResult = await res.json();
      setStudents(result.data || []);
      setTotalCount(result.totalCount || 0);
      setTotalPages(result.totalPages || 0);
      setIsConfigured(result.isConfigured !== false);
      setResultSource(result.source || 'supabase_db');
      setIsCapped(Boolean(result.isCapped));
      setNoticeMessage(null);

      // If auto-fallback happened, store it for the small inline notice
      if (result.gatewayFailed) {
        setGatewayFailed(result.gatewayFailed);
      }

      if (!result.isConfigured) {
        setErrorMessage(result.message || 'Supabase belum dikonfigurasi.');
      }

      setHasSearched(true);
    } catch (err) {
      console.error('Gagal mengambil data mahasiswa:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Terjadi kendala saat membaca data mahasiswa.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedCampus, selectedYear, selectedStatus, currentPage, pageSize]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const handleCampusChange = (campus: Institution | null) => {
    setSelectedCampus(campus);
    setCurrentPage(1);
  };

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    setCurrentPage(1);
  };

  const handleStatusChange = (status: string) => {
    setSelectedStatus(status);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCampus(null);
    setSelectedYear('');
    setSelectedStatus('');
    setCurrentPage(1);
  };

  const handleDownloadCsv = () => {
    setIsDownloadingCsv(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (selectedCampus?.kode_pt) params.set('kode_pt', selectedCampus.kode_pt);
      if (selectedYear) params.set('tahun_masuk', selectedYear);
      if (selectedStatus) params.set('status', selectedStatus);
      window.location.href = `/api/students/export?${params.toString()}`;
    } finally {
      setTimeout(() => setIsDownloadingCsv(false), 2000);
    }
  };

  // Label badges for each source type
  const sourceLabel =
    resultSource === 'pddikti_live'
      ? { dot: 'bg-emerald-500 animate-pulse', bar: 'bg-emerald-50/90 border-emerald-200/90 text-emerald-950', title: 'text-emerald-900', label: 'Pencarian Langsung PDDikti', desc: 'Hasil diperoleh secara real-time dari server PDDikti Kemdiktisaintek.' }
      : { dot: 'bg-indigo-500', bar: 'bg-indigo-50/90 border-indigo-200/90 text-indigo-950', title: 'text-indigo-900', label: 'Arsip Database Supabase', desc: 'Hasil dari arsip 100.507 mahasiswa yang telah diverifikasi dari PDDikti.' };

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero */}
        <div className="text-center max-w-3xl mx-auto mb-8 space-y-2.5">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Penelusuran Direktori Mahasiswa Aceh
          </h1>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Akses informasi akademik resmi mahasiswa di seluruh perguruan tinggi Provinsi Aceh.
            Cari secara global atau batasi penelusuran pada kampus tertentu.
          </p>
        </div>

        {/* Search & Filter */}
        <SearchFilterBar
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          selectedCampus={selectedCampus}
          onCampusChange={handleCampusChange}
          selectedYear={selectedYear}
          onYearChange={handleYearChange}
          selectedStatus={selectedStatus}
          onStatusChange={handleStatusChange}
          onResetFilters={handleResetFilters}
          totalResults={totalCount}
          isLoading={isLoading}
          isDownloadingCsv={isDownloadingCsv}
          onDownloadCsv={handleDownloadCsv}
        />

        {/* Empirical constraints info */}
        <StatusNotice />

        {/* Results */}
        <div className="mt-6 space-y-4">

          {/* Source badge — shown when query active and no error blocking view */}
          {(searchQuery.trim() || selectedCampus) && !errorMessage && !isLoading && hasSearched && (
            <div className={`rounded-2xl p-4 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-sm animate-in fade-in border ${sourceLabel.bar}`}>
              <div className="flex items-center space-x-2.5">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sourceLabel.dot}`} />
                <div>
                  <span className={`font-bold ${sourceLabel.title}`}>{sourceLabel.label}:</span>{' '}
                  <span>{sourceLabel.desc}</span>
                </div>
              </div>
              {isCapped && (
                <span className="text-amber-800 bg-amber-100/80 border border-amber-300 px-2.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                  Batas 100 data tercapai
                </span>
              )}
            </div>
          )}

          {/* Small fallback notice — shown when auto-fallback happened but results ARE present */}
          {gatewayFailed && students.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-2.5 text-xs flex items-start space-x-2">
              <span className="font-semibold mt-0.5 shrink-0">ℹ️ Catatan:</span>
              <span>
                Pencarian langsung PDDikti tidak tersedia saat ini. Hasil di bawah diambil otomatis dari arsip database terverifikasi.
              </span>
            </div>
          )}

          {/* Generic notice message (e.g. "no results from live, showing archive") */}
          {noticeMessage && !errorMessage && students.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-2.5 text-xs flex items-center space-x-2">
              <span className="font-semibold">ℹ️</span>
              <span>{noticeMessage}</span>
            </div>
          )}

          {/* Main content area */}
          {!isConfigured ? (
            <EmptyState type="unconfigured" message={errorMessage || undefined} />
          ) : errorMessage ? (
            <EmptyState
              type="error"
              message={errorMessage}
              onRetry={() => fetchStudents()}
            />
          ) : isLoading ? (
            <LoadingSkeleton />
          ) : students.length > 0 ? (
            <>
              <StudentTable
                students={students}
                currentPage={currentPage}
                pageSize={pageSize}
                onSelectCampus={handleCampusChange}
              />
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalCount={totalCount}
                onPageChange={(p) => setCurrentPage(p)}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setCurrentPage(1);
                }}
              />
            </>
          ) : hasSearched ? (
            <EmptyState type="not-found" onReset={handleResetFilters} />
          ) : (
            <EmptyState type="initial" />
          )}
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>
            © {new Date().getFullYear()} Direktori Mahasiswa Aceh. Dikelola untuk kepentingan verifikasi publik.
          </p>
          <div className="flex items-center space-x-4 text-slate-400">
            <span>Next.js App Router</span>
            <span>•</span>
            <span>TypeScript</span>
            <span>•</span>
            <span>Supabase PostgreSQL</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
