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

  // Fetch students from server-side Supabase query
  const fetchStudents = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (selectedCampus?.kode_pt) params.set('kode_pt', selectedCampus.kode_pt);
      if (selectedYear) params.set('tahun_masuk', selectedYear);
      if (selectedStatus) params.set('status', selectedStatus);
      params.set('page', String(currentPage));
      params.set('page_size', String(pageSize));

      const res = await fetch(`/api/students?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Server merespons status ${res.status}`);
      }

      const result: StudentQueryResult = await res.json();
      setStudents(result.data || []);
      setTotalCount(result.totalCount || 0);
      setTotalPages(result.totalPages || 0);
      setIsConfigured(result.isConfigured !== false);
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
  }, [searchQuery, selectedCampus, selectedYear, selectedStatus, currentPage, pageSize]);

  // Trigger query on parameter change
  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Reset page to 1 when filters change
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
          {!isConfigured ? (
            <EmptyState
              type="unconfigured"
              message={errorMessage || undefined}
            />
          ) : errorMessage ? (
            <EmptyState
              type="error"
              message={errorMessage}
              onRetry={fetchStudents}
            />
          ) : isLoading ? (
            <LoadingSkeleton />
          ) : students.length > 0 ? (
            <>
              <StudentTable
                students={students}
                currentPage={currentPage}
                pageSize={pageSize}
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
