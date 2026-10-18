'use client';

import React, { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, Download, RotateCcw, X, Calendar, UserCheck } from 'lucide-react';
import CampusAutocomplete from './CampusAutocomplete';
import { Institution, FilterOptions } from '@/lib/types';

interface SearchFilterBarProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  selectedCampus: Institution | null;
  onCampusChange: (campus: Institution | null) => void;
  selectedYear: string;
  onYearChange: (year: string) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  onResetFilters: () => void;
  totalResults: number;
  isLoading: boolean;
  isDownloadingCsv: boolean;
  onDownloadCsv: () => void;
}

export default function SearchFilterBar({
  searchQuery,
  onSearchChange,
  selectedCampus,
  onCampusChange,
  selectedYear,
  onYearChange,
  selectedStatus,
  onStatusChange,
  onResetFilters,
  totalResults,
  isLoading,
  isDownloadingCsv,
  onDownloadCsv,
}: SearchFilterBarProps) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ years: [], statuses: [] });
  const [localSearch, setLocalSearch] = useState(searchQuery);

  // Sync internal search state
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Debounce input: otomatis mengeksekusi pencarian 500ms setelah user berhenti mengetik
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch.trim() !== searchQuery.trim()) {
        onSearchChange(localSearch);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [localSearch, searchQuery, onSearchChange]);

  // Fetch dynamic filter options from database
  useEffect(() => {
    async function loadFilters() {
      try {
        const url = selectedCampus
          ? `/api/filters?kode_pt=${encodeURIComponent(selectedCampus.kode_pt)}`
          : '/api/filters';
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setFilterOptions({
            years: data.years || [],
            statuses: data.statuses || [],
          });
        }
      } catch (e) {
        console.error('Gagal mengambil opsi filter:', e);
      }
    }
    loadFilters();
  }, [selectedCampus]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchChange(localSearch);
  };

  const hasActiveFilters = Boolean(
    selectedCampus || selectedYear || selectedStatus || searchQuery
  );

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-6 transition-all">
      {/* Main Search Row */}
      <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-3">
        {/* Name / NIM Input */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Cari Nama Mahasiswa atau NIM (contoh: 04027342)..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-9 text-sm rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 transition"
          />
          {localSearch && (
            <button
              type="button"
              onClick={() => {
                setLocalSearch('');
                onSearchChange('');
              }}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Campus Autocomplete */}
        <div className="w-full lg:w-72">
          <CampusAutocomplete
            selectedCampus={selectedCampus}
            onSelectCampus={onCampusChange}
          />
        </div>

        {/* Search Submit Button */}
        <button
          type="submit"
          className="h-11 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-sm flex items-center justify-center space-x-2 shadow-sm transition active:scale-95 flex-shrink-0"
        >
          <Search className="w-4 h-4 text-emerald-200" />
          <span>Cari</span>
        </button>

        {/* Filter Toggle Button */}
        <button
          type="button"
          onClick={() => setShowAdvancedFilters((prev) => !prev)}
          className={`h-11 px-4 rounded-xl border text-sm font-medium flex items-center justify-center space-x-2 transition flex-shrink-0 ${
            showAdvancedFilters || selectedYear || selectedStatus
              ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
              : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Filter</span>
          {(selectedYear || selectedStatus) && (
            <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
          )}
        </button>
      </form>

      {/* Advanced Filters Expandable Drawer */}
      {showAdvancedFilters && (
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Tahun Masuk Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Tahun Masuk (Angkatan)</span>
            </label>
            <select
              value={selectedYear}
              onChange={(e) => onYearChange(e.target.value)}
              className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">Semua Tahun Masuk</option>
              {filterOptions.years.map((year) => (
                <option key={year} value={year}>
                  Tahun {year}
                </option>
              ))}
            </select>
          </div>

          {/* Status Mahasiswa Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center space-x-1.5">
              <UserCheck className="w-3.5 h-3.5 text-slate-400" />
              <span>Status Mahasiswa</span>
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => onStatusChange(e.target.value)}
              className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">Semua Status</option>
              {filterOptions.statuses.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Action */}
          <div className="sm:col-span-2 lg:col-span-1 flex items-end">
            <button
              type="button"
              onClick={onResetFilters}
              disabled={!hasActiveFilters}
              className={`h-10 px-4 w-full rounded-xl border text-sm font-medium flex items-center justify-center space-x-2 transition ${
                hasActiveFilters
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Semua Filter</span>
            </button>
          </div>
        </div>
      )}

      {/* Results Bar and CSV Download Action */}
      <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center space-x-2">
          <span className="font-medium text-slate-500">Hasil Penelusuran:</span>
          {isLoading ? (
            <span className="font-semibold text-slate-700 animate-pulse">Memuat...</span>
          ) : (
            <span className="font-bold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-full text-xs">
              {totalResults.toLocaleString('id-ID')} data cocok
            </span>
          )}
          {selectedCampus && (
            <span className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-medium text-xs hidden md:inline">
              Dibatasi: {selectedCampus.nama_singkat || selectedCampus.nama}
            </span>
          )}
        </div>

        {/* Export CSV Button */}
        <button
          type="button"
          onClick={onDownloadCsv}
          disabled={totalResults === 0 || isDownloadingCsv}
          title="Unduh seluruh data hasil pencarian dan filter saat ini dalam format CSV"
          className={`h-9 px-3.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition ${
            totalResults > 0 && !isDownloadingCsv
              ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-sm active:scale-95'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
          }`}
        >
          <Download className="w-3.5 h-3.5 stroke-[2.2]" />
          <span>
            {isDownloadingCsv ? 'Menyiapkan CSV...' : 'Unduh CSV Seluruh Hasil'}
          </span>
        </button>
      </div>
    </div>
  );
}
