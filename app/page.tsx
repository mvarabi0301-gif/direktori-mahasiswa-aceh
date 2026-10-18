'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import SearchFilterBar from '@/components/SearchFilterBar';
import StudentTable from '@/components/StudentTable';
import Pagination from '@/components/Pagination';
import EmptyState from '@/components/EmptyState';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { Institution, StudentPublic, StudentQueryResult } from '@/lib/types';
import { Database, Wifi } from 'lucide-react';

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
      setResultSource(result.source || 'supabase_db');
      setHasSearched(true);
    } catch (err) {
      console.error('Gagal mengambil data mahasiswa:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Terjadi kendala saat membaca data mahasiswa.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedCampus, selectedYear, selectedStatus, currentPage, pageSize, preferredSource]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

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

  // Show source badge only when results are visible
  const showSourceBadge = hasSearched && !isLoading && students.length > 0;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Hero */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Penelusuran Data Mahasiswa
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Telusuri mahasiswa aktif dan alumni di seluruh perguruan tinggi Provinsi Aceh berdasarkan nama atau NIM.
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

        {/* Results Area */}
        <div className="mt-5 space-y-4">

          {/* Source badge — small, non-intrusive */}
          {showSourceBadge && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{totalCount.toLocaleString('id-ID')}</span> data ditemukan
              </p>
              {resultSource === 'pddikti_live' ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                  <Wifi className="w-3 h-3" />
                  Sumber: Live PDDikti
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
                  <Database className="w-3 h-3" />
                  Sumber: Arsip Database
                </span>
              )}
            </div>
          )}

          {/* Main content */}
          {!isConfigured ? (
            <EmptyState type="unconfigured" />
          ) : errorMessage ? (
            <EmptyState
              type="error"
              message={errorMessage}
              onRetry={() => {
                setPreferredSource('auto');
                fetchStudents('auto');
              }}
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

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-5 mt-12 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} Direktori Mahasiswa Aceh. Data akademik dari PDDikti Kemdiktisaintek.</p>
          <div className="flex items-center space-x-3">
            <span>Next.js</span>
            <span>·</span>
            <span>TypeScript</span>
            <span>·</span>
            <span>Supabase</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
