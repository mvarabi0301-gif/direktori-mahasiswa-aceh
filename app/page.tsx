'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from '@/components/Navbar';
import SearchFilterBar from '@/components/SearchFilterBar';
import StudentTable from '@/components/StudentTable';
import Pagination from '@/components/Pagination';
import StatusNotice from '@/components/StatusNotice';
import EmptyState from '@/components/EmptyState';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { Institution, StudentPublic, StudentQueryResult } from '@/lib/types';

// Kata kunci yang mengindikasikan kampus Aceh (harus sinkron dengan edge proxy)
const ACEH_KEYWORDS = [
  'aceh', 'syiah kuala', 'malikussaleh', 'teungku', 'tgk', 'dayah',
  'iskandar muda', 'al-washliyah', 'al washliyah', 'langsa', 'lhokseumawe',
  'sabang', 'meulaboh', 'bireuen', 'takengon', 'sigli', 'calang', 'sinabang',
  'tapaktuan', 'singkil', 'blangpidie', 'kualasimpang', 'idi', 'meureudu',
  'peureulak', 'samalanga', 'beutong', 'jeuram', 'blangkejeren', 'kutacane',
  'jantho', 'abdya', 'gayo', 'simeulue', 'pidie', 'bener meriah'
];

function isAcehCampus(namaPt: string): boolean {
  if (!namaPt) return false;
  const lower = namaPt.toLowerCase();
  return ACEH_KEYWORDS.some((kw) => lower.includes(kw));
}

function inferTahunMasuk(nim?: string | null): number | null {
  if (!nim) return null;
  const clean = nim.trim();
  if (/^(19\d{2}|20\d{2})/.test(clean)) {
    const y = parseInt(clean.slice(0, 4), 10);
    if (y >= 1980 && y <= 2030) return y;
  }
  if (/^\d{2}/.test(clean)) {
    const prefix = parseInt(clean.slice(0, 2), 10);
    if (prefix >= 80 && prefix <= 99) return 1900 + prefix;
    if (prefix >= 0 && prefix <= 35) return 2000 + prefix;
  }
  return null;
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
  const [preferredSource, setPreferredSource] = useState<'auto' | 'supabase'>('auto');
  const [isCapped, setIsCapped] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  // Simpan semua hasil PDDikti (untuk pagination client-side)
  const allLiveResultsRef = useRef<StudentPublic[]>([]);

  // ── Pencarian Langsung PDDikti (dari browser, bukan server) ──────────────────
  // Browser user memiliki IP residential sehingga tidak diblokir WAF PDDikti.
  // /api/pddikti-search adalah edge proxy yang juga mencoba dari edge node.
  const fetchFromPDDikti = useCallback(async (keyword: string, campusFilter?: Institution | null) => {
    setIsLoading(true);
    setErrorMessage(null);
    setResultSource('pddikti_live');

    try {
      // Panggil langsung ke PDDikti dari browser user (IP residential)
      const encoded = encodeURIComponent(keyword.trim());
      const pddiktiUrl = `https://pddikti.kemdiktisaintek.go.id/api/pencarian/mhs/${encoded}`;

      const res = await fetch(pddiktiUrl, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'id-ID,id;q=0.9',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? `API PDDikti menolak permintaan (HTTP 403). Ini bisa terjadi jika jaringan Anda diblokir atau CORS mencegah akses langsung.`
            : `API PDDikti merespons ${res.status}.`
        );
      }

      const json = await res.json();
      type RawItem = {
        id?: string;
        nama?: string;
        nim?: string;
        nama_pt?: string;
        sinkatan_pt?: string;
        singkatan_pt?: string;
        nama_prodi?: string;
      };
      const rawList: RawItem[] = json?.data ?? json ?? [];
      const isCapped = rawList.length >= 100;

      // Filter & petakan hasil
      const allResults: StudentPublic[] = [];
      const seenNims = new Set<string>();

      for (const item of rawList) {
        const nim = (item.nim || '').trim();
        const nama = (item.nama || '').trim();
        const studentPt = (item.nama_pt || '').trim();
        const prodi = (item.nama_prodi || '').trim() || '-';

        if (!nim || !nama) continue;

        // Filter kampus
        if (campusFilter) {
          // Filter ketat ke kampus yang dipilih
          const normTarget = (campusFilter.nama || '').toUpperCase().replace(/\s+/g, ' ').replace(/[^A-Z0-9 ]/g, '').trim();
          const normStudent = studentPt.toUpperCase().replace(/\s+/g, ' ').replace(/[^A-Z0-9 ]/g, '').trim();
          if (normStudent !== normTarget) continue;
        } else {
          // Filter ke kampus Aceh saja
          if (!isAcehCampus(studentPt)) continue;
        }

        // Filter tahun masuk
        const tahunMasuk = inferTahunMasuk(nim);
        if (selectedYear && String(selectedYear).trim() !== '') {
          if (tahunMasuk !== Number(selectedYear)) continue;
        }

        const dedupeKey = `${nim}-${studentPt}`;
        if (seenNims.has(dedupeKey)) continue;
        seenNims.add(dedupeKey);

        allResults.push({
          id: item.id || `live-${nim}`,
          kode_pt: campusFilter?.kode_pt || '000000',
          nama_pt: studentPt || campusFilter?.nama || 'Perguruan Tinggi',
          nim,
          nama,
          prodi,
          jenjang: null,
          status: 'Aktif',
          tanggal_masuk: null,
          tahun_masuk: tahunMasuk,
          jenis_kelamin: null,
          synced_at: new Date().toISOString(),
        });
      }

      // Simpan semua hasil untuk pagination client-side
      allLiveResultsRef.current = allResults;

      const totalCount = allResults.length;
      const totalPages = Math.ceil(totalCount / pageSize);
      const from = (currentPage - 1) * pageSize;
      const paginatedData = allResults.slice(from, from + pageSize);

      setStudents(paginatedData);
      setTotalCount(totalCount);
      setTotalPages(totalPages);
      setIsConfigured(true);
      setIsCapped(isCapped);
      setNoticeMessage(
        isCapped ? 'Hasil dibatasi 100 data oleh API PDDikti. Gunakan kata kunci lebih spesifik.' : null
      );
      setHasSearched(true);
    } catch (browserErr) {
      // Browser langsung gagal (CORS atau network error) — coba via server proxy
      console.warn('[PDDikti Browser] Gagal langsung, mencoba via server proxy:', browserErr);
      await fetchViaServerProxy(keyword, campusFilter);
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedStatus, currentPage, pageSize]);

  // ── Fallback: Proxy Server (edge runtime) ───────────────────────────────────
  const fetchViaServerProxy = useCallback(async (keyword: string, campusFilter?: Institution | null) => {
    const params = new URLSearchParams({ q: keyword.trim() });
    if (!campusFilter) params.set('filter_aceh', 'true');
    else params.set('filter_aceh', 'false');

    try {
      const res = await fetch(`/api/pddikti-search?${params}`);
      const json = await res.json();

      if (json.status === 'error') {
        throw new Error(json.message || 'Pencarian PDDikti gagal dari server.');
      }

      type RawItem = { id?: string; nama?: string; nim?: string; nama_pt?: string; sinkatan_pt?: string; singkatan_pt?: string; nama_prodi?: string; };
      const rawList: RawItem[] = json.data || [];
      const isCapped = json.isCapped || false;

      const allResults: StudentPublic[] = [];
      const seenNims = new Set<string>();

      for (const item of rawList) {
        const nim = (item.nim || '').trim();
        const nama = (item.nama || '').trim();
        const studentPt = (item.nama_pt || '').trim();
        const prodi = (item.nama_prodi || '').trim() || '-';
        if (!nim || !nama) continue;

        if (campusFilter) {
          const normTarget = (campusFilter.nama || '').toUpperCase().replace(/\s+/g, ' ').replace(/[^A-Z0-9 ]/g, '').trim();
          const normStudent = studentPt.toUpperCase().replace(/\s+/g, ' ').replace(/[^A-Z0-9 ]/g, '').trim();
          if (normStudent !== normTarget) continue;
        }

        const tahunMasuk = inferTahunMasuk(nim);
        if (selectedYear && String(selectedYear).trim() !== '') {
          if (tahunMasuk !== Number(selectedYear)) continue;
        }

        const dedupeKey = `${nim}-${studentPt}`;
        if (seenNims.has(dedupeKey)) continue;
        seenNims.add(dedupeKey);

        allResults.push({
          id: item.id || `proxy-${nim}`,
          kode_pt: campusFilter?.kode_pt || '000000',
          nama_pt: studentPt || campusFilter?.nama || 'Perguruan Tinggi',
          nim, nama, prodi,
          jenjang: null, status: 'Aktif',
          tanggal_masuk: null,
          tahun_masuk: tahunMasuk,
          jenis_kelamin: null,
          synced_at: new Date().toISOString(),
        });
      }

      allLiveResultsRef.current = allResults;
      const totalCount = allResults.length;
      const totalPages = Math.ceil(totalCount / pageSize);
      const from = (currentPage - 1) * pageSize;

      setStudents(allResults.slice(from, from + pageSize));
      setTotalCount(totalCount);
      setTotalPages(totalPages);
      setIsConfigured(true);
      setIsCapped(isCapped);
      setResultSource('pddikti_live');
      setNoticeMessage(isCapped ? 'Hasil dibatasi 100 data oleh API PDDikti. Gunakan kata kunci lebih spesifik.' : null);
      setHasSearched(true);
    } catch (proxyErr) {
      console.error('[PDDikti Proxy] Gagal:', proxyErr);
      const msg = proxyErr instanceof Error ? proxyErr.message : 'Pencarian langsung PDDikti tidak tersedia.';
      setErrorMessage(msg);
      setHasSearched(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, currentPage, pageSize]);

  // ── Fetch dari Supabase (arsip/browse kampus) ────────────────────────────────
  const fetchFromSupabase = useCallback(async (forcedSrc?: 'auto' | 'supabase') => {
    setIsLoading(true);
    setErrorMessage(null);

    const activeSrc = forcedSrc || preferredSource;

    try {
      const params = new URLSearchParams();
      if (activeSrc === 'supabase' && searchQuery.trim()) params.set('q', searchQuery.trim());
      if (selectedCampus?.kode_pt) params.set('kode_pt', selectedCampus.kode_pt);
      if (selectedYear) params.set('tahun_masuk', selectedYear);
      if (selectedStatus) params.set('status', selectedStatus);
      params.set('source', 'supabase');
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
      setResultSource('supabase_db');
      setIsCapped(false);
      setNoticeMessage(result.message || null);
      if (result.message && !result.isConfigured) setErrorMessage(result.message);
      setHasSearched(true);
    } catch (err) {
      console.error('Gagal mengambil data dari Supabase:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Terjadi kendala saat membaca data.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedCampus, selectedYear, selectedStatus, currentPage, pageSize, preferredSource]);

  // ── Fungsi utama: routing ke sumber yang sesuai ─────────────────────────────
  const fetchStudents = useCallback(async (forcedSrc?: 'auto' | 'supabase') => {
    const activeSrc = forcedSrc || preferredSource;

    // Jika pengguna mengetik keyword pencarian DAN tidak memaksa ke supabase:
    // → Coba PDDikti langsung dari browser
    if (searchQuery.trim() !== '' && activeSrc !== 'supabase') {
      await fetchFromPDDikti(searchQuery.trim(), selectedCampus);
      return;
    }

    // Jika ada kampus dipilih tapi tidak ada keyword:
    // → Tampilkan arsip Supabase untuk kampus tersebut
    await fetchFromSupabase(forcedSrc);
  }, [searchQuery, selectedCampus, preferredSource, fetchFromPDDikti, fetchFromSupabase]);

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
          {searchQuery.trim() && !errorMessage && hasSearched && (
            <div className={`border rounded-2xl p-4 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-sm animate-in fade-in ${resultSource === 'pddikti_live' ? 'bg-emerald-50/90 border-emerald-200/90 text-emerald-950' : 'bg-blue-50/90 border-blue-200/90 text-blue-950'}`}>
              <div className="flex items-center space-x-2.5">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${resultSource === 'pddikti_live' ? 'bg-emerald-500 animate-pulse' : 'bg-blue-400'}`}></span>
                <div>
                  {resultSource === 'pddikti_live' ? (
                    <><span className="font-bold text-emerald-900">Sumber: PDDikti Live</span>{' '}
                    <span>Hasil diperoleh langsung dari API PDDikti Kemdiktisaintek secara real-time.</span></>
                  ) : (
                    <><span className="font-bold text-blue-900">Sumber: Arsip Database Terverifikasi</span>{' '}
                    <span>Menampilkan data dari 100.507 mahasiswa yang telah diverifikasi dari PDDikti.</span></>
                  )}
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
                onPageChange={(p) => {
                  setCurrentPage(p);
                  // Untuk hasil PDDikti live (data sudah ada di memory), paginate langsung
                  if (resultSource === 'pddikti_live' && allLiveResultsRef.current.length > 0) {
                    const from = (p - 1) * pageSize;
                    setStudents(allLiveResultsRef.current.slice(from, from + pageSize));
                  }
                }}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setCurrentPage(1);
                  if (resultSource === 'pddikti_live' && allLiveResultsRef.current.length > 0) {
                    setStudents(allLiveResultsRef.current.slice(0, s));
                    setTotalPages(Math.ceil(allLiveResultsRef.current.length / s));
                  }
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
