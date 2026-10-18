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
  const [preferredSource, setPreferredSource] = useState<'auto' | 'supabase'>('auto');
  const [isCapped, setIsCapped] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Fetch students from server-side Supabase query or live PDDikti
  const fetchStudents = useCallback(async (forcedSrc?: 'auto' | 'supabase') => {
    setIsLoading(true);
    setErrorMessage(null);

    const activeSrc = forcedSrc || preferredSource;

    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (selectedCampus?.kode_pt) {
        params.set('kode_pt', selectedCampus.kode_pt);
        if (selectedCampus.nama) params.set('nama_pt', selectedCampus.nama);
      }
      if (selectedYear) params.set('tahun_masuk', selectedYear);
      if (selectedStatus) params.set('status', selectedStatus);
      if (activeSrc === 'supabase') params.set('source', 'supabase');
      params.set('page', String(currentPage));
      params.set('page_size', String(pageSize));

      const res = await fetch(`/api/students?${params.toString()}`);
      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        throw new Error(errorJson?.message || errorJson?.error || `Server merespons status ${res.status}`);
      }

      const result: StudentQueryResult = await res.json();
      setStudents(result.data || []);
      setTotalCount(result.totalCount || 0);
      setTotalPages(result.totalPages || 0);
      setIsConfigured(result.isConfigured !== false);
      setResultSource(result.source || (searchQuery.trim() ? 'pddikti_live' : 'supabase_db'));
      setIsCapped(Boolean(result.isCapped));
      setNoticeMessage(result.message || null);
      if (result.message && !result.isConfigured) {
        setErrorMessage(result.message);
      }
      setHasSearched(true);
    } catch (err) {
      console.error('Gagal mengambil data mahasiswa:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Terjadi kendala saat membaca data mahasiswa.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedCampus, selectedYear, selectedStatus, currentPage, pageSize, preferredSource]);

  // Trigger query on parameter change
  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Reset page to 1 when filters change
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setPreferredSource('auto');
    setCurrentPage(1);
  };

  const handleCampusChange = (campus: Institution | null) => {
    setSelectedCampus(campus);
    setPreferredSource('auto');
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
    setPreferredSource('auto');
    setCurrentPage(1);
  };

  // Download complete CSV of ALL results matching current query & filters
  const handleDownloadCsv = () => {
    setIsDownloadingCsv(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (selectedCampus?.kode_pt) params.set('kode_pt', selectedCampus.kode_pt);
      if (selectedYear) params.set('tahun_masuk', selectedYear);
      if (selectedStatus) params.set('status', selectedStatus);

      // Trigger direct download via browser navigation
      window.location.href = `/api/students/export?${params.toString()}`;
    } finally {
      setTimeout(() => setIsDownloadingCsv(false), 2000);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Title Section */}
        <div className="text-center max-w-3xl mx-auto mb-8 space-y-2.5">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Penelusuran Direktori Mahasiswa Aceh
          </h1>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Akses informasi akademik resmi mahasiswa di seluruh perguruan tinggi Provinsi Aceh.
            Cari secara global atau batasi penelusuran pada kampus tertentu.
          </p>
        </div>

        {/* Search & Filter Component */}
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

        {/* Status & Empirical Constraints Notice */}
        <StatusNotice />

        {/* Results Area */}
        <div className="mt-6 space-y-4">
          {/* Live PDDikti / DB Source Notice */}
          {searchQuery.trim() && (
            <div className="bg-emerald-50/90 border border-emerald-200/90 text-emerald-950 rounded-2xl p-4 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-sm animate-in fade-in">
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></span>
                <div>
                  <span className="font-bold text-emerald-900">Pencarian Langsung PDDikti:</span>{' '}
                  <span>Hasil penelusuran diperoleh secara real-time langsung dari server PDDikti Kemdiktisaintek.</span>
                </div>
              </div>
              {isCapped && (
                <span className="text-amber-800 bg-amber-100/80 border border-amber-300 px-2.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                  Batas 100 data tercapai
                </span>
              )}
            </div>
          )}

          {noticeMessage && !errorMessage && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-2.5 text-xs flex items-center space-x-2">
              <span className="font-semibold">Perhatian:</span>
              <span>{noticeMessage}</span>
            </div>
          )}

          {!isConfigured ? (
            <EmptyState
              type="unconfigured"
              message={errorMessage || undefined}
            />
          ) : errorMessage ? (
            <EmptyState
              type="error"
              message={errorMessage}
              onRetry={() => {
                setPreferredSource('auto');
                fetchStudents('auto');
              }}
              onFallback={
                searchQuery.trim()
                  ? () => {
                      setPreferredSource('supabase');
                      fetchStudents('supabase');
                    }
                  : undefined
              }
              fallbackLabel="Cari di Arsip Database Terverifikasi (100.507 Mahasiswa)"
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
            <EmptyState
              type="not-found"
              onReset={handleResetFilters}
            />
          ) : (
            <EmptyState type="initial" />
          )}
        </div>
      </main>

      {/* Footer */}
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
