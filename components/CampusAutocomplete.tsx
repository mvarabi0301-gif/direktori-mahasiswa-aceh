'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Building2, Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { Institution } from '@/lib/types';

interface CampusAutocompleteProps {
  selectedCampus: Institution | null;
  onSelectCampus: (campus: Institution | null) => void;
  disabled?: boolean;
}

export default function CampusAutocomplete({
  selectedCampus,
  onSelectCampus,
  disabled = false,
}: CampusAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch institutions dynamically from DB
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);

    const debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/institutions?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setInstitutions(data.institutions || []);
          }
        }
      } catch (err) {
        console.error('Gagal mengambil daftar kampus:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(debounceTimer);
    };
  }, [searchQuery, isOpen]);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectCampus(null);
    setSearchQuery('');
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Trigger Button */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (!disabled) {
            setIsOpen((prev) => !prev);
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }}
        className={`w-full min-h-[46px] px-3.5 py-2 flex items-center justify-between rounded-xl border bg-white text-left text-sm transition-all shadow-sm ${
          isOpen
            ? 'border-emerald-600 ring-2 ring-emerald-500/20'
            : 'border-slate-200 hover:border-slate-300'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className="flex items-center space-x-2.5 overflow-hidden pr-2">
          <Building2 className={`w-4 h-4 flex-shrink-0 ${selectedCampus ? 'text-emerald-700' : 'text-slate-400'}`} />
          {selectedCampus ? (
            <div className="truncate">
              <span className="font-semibold text-slate-800">{selectedCampus.nama}</span>
              {selectedCampus.nama_singkat && (
                <span className="ml-1.5 text-xs font-normal text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded">
                  {selectedCampus.nama_singkat}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-600 font-medium">
              Semua Perguruan Tinggi (Pencarian Global)
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1 flex-shrink-0">
          {selectedCampus && (
            <button
              type="button"
              onClick={handleClear}
              title="Kembali ke pencarian global"
              className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronsUpDown className="w-4 h-4 text-slate-400" />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-2 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search Input inside Dropdown */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/70">
            <input
              ref={inputRef}
              type="text"
              placeholder="Ketik nama kampus atau kode PT..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
            />
          </div>

          {/* Items List */}
          <div className="max-h-60 overflow-y-auto p-1.5 divide-y divide-slate-50">
            {/* Global search option */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                onSelectCampus(null);
                setIsOpen(false);
              }}
              className={`flex items-center justify-between px-3 py-2 text-sm rounded-lg cursor-pointer transition ${
                !selectedCampus
                  ? 'bg-emerald-50 text-emerald-900 font-semibold'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>Semua Perguruan Tinggi (Pencarian Global)</span>
              {!selectedCampus && <Check className="w-4 h-4 text-emerald-600" />}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-slate-400 space-x-2 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                <span>Memuat data kampus...</span>
              </div>
            ) : institutions.length > 0 ? (
              institutions.map((inst) => {
                const isSelected = selectedCampus?.kode_pt === inst.kode_pt;
                return (
                  <div
                    key={inst.kode_pt}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      onSelectCampus(inst);
                      setIsOpen(false);
                    }}
                    className={`flex items-center justify-between px-3 py-2 text-sm rounded-lg cursor-pointer transition ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-900 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-col pr-2">
                      <span className="leading-snug">{inst.nama}</span>
                      <span className="text-xs text-slate-400 font-normal">
                        Kode: {inst.kode_pt} {inst.nama_singkat ? `• ${inst.nama_singkat}` : ''}
                      </span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                  </div>
                );
              })
            ) : (
              <div className="py-4 text-center text-xs text-slate-400">
                {searchQuery
                  ? 'Tidak ada kampus yang cocok dengan pencarian.'
                  : 'Belum ada data kampus yang terdaftar di database.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
