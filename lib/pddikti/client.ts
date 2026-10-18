import { StudentPublic } from '@/lib/types';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const BASE_URL = 'https://pddikti.kemdiktisaintek.go.id';

const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': `${BASE_URL}/`,
  'Origin': BASE_URL,
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

export function cleanString(str?: string | null): string {
  if (!str) return '';
  return str.trim();
}

export function normalizeCampusName(name?: string | null): string {
  if (!name) return '';
  return name
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[^A-Z0-9 ]/g, '')
    .trim();
}

export function inferTahunMasuk(nim?: string | null): number | null {
  if (!nim) return null;
  const clean = nim.trim();

  // Format 4 digit: 2021..., 1999...
  if (/^(19\d{2}|20\d{2})/.test(clean)) {
    const y = parseInt(clean.slice(0, 4), 10);
    if (y >= 1980 && y <= 2030) return y;
  }

  // Format 2 digit prefix: 21..., 22..., 23..., 02..., 98...
  if (/^\d{2}/.test(clean)) {
    const prefix = parseInt(clean.slice(0, 2), 10);
    if (prefix >= 80 && prefix <= 99) return 1900 + prefix;
    if (prefix >= 0 && prefix <= 35) return 2000 + prefix;
  }

  return null;
}

export interface PDDiktiStudentRaw {
  id?: string;
  nama?: string;
  nim?: string;
  nama_pt?: string;
  sinkatan_pt?: string;
  singkatan_pt?: string;
  nama_prodi?: string;
}

export interface LiveSearchResult {
  data: StudentPublic[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isCapped: boolean;
  source: 'pddikti_live' | 'supabase_db';
  message?: string;
}

/**
 * Panggil API PDDikti secara langsung dengan timeout dan abort controller
 */
async function fetchPDDiktiJson<T>(endpoint: string, timeoutMs = 8000): Promise<{ data: T | null; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers: HEADERS,
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 429) {
        return { data: null, error: 'Batas frekuensi permintaan API PDDikti tercapai (HTTP 429). Silakan tunggu sejenak.' };
      }
      if (res.status === 403) {
        return { data: null, error: 'API PDDikti membatasi akses dari IP cloud server (HTTP 403 - Firewall Kemdiktisaintek). Silakan coba lagi atau gunakan tombol arsip database terverifikasi.' };
      }
      return { data: null, error: `API PDDikti merespons kode HTTP ${res.status}.` };
    }

    const json = await res.json();
    return { data: (json.data ?? json) as T };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        return { data: null, error: `Permintaan ke server PDDikti melampaui batas waktu (${timeoutMs / 1000} detik). Silakan coba lagi.` };
      }
      return { data: null, error: `Gagal menghubungi API PDDikti: ${err.message}` };
    }
    return { data: null, error: 'Terjadi kegagalan komunikasi dengan API PDDikti.' };
  }
}

/**
 * Cache/Upsert mahasiswa dari respons PDDikti ke Supabase di latar belakang
 */
async function cacheStudentsToSupabase(students: StudentPublic[]): Promise<void> {
  if (!students || students.length === 0) return;

  try {
    const client = getSupabaseServerClient();
    if (!client) return;

    const payload = students
      .filter((s) => s.nim && s.nama && s.kode_pt)
      .map((s) => ({
        kode_pt: s.kode_pt,
        nama_pt: s.nama_pt,
        nim: s.nim,
        nama: s.nama,
        kode_prodi: null,
        prodi: s.prodi,
        jenjang: s.jenjang,
        status: s.status || 'Aktif',
        tanggal_masuk: s.tanggal_masuk,
        tahun_masuk: s.tahun_masuk,
        jenis_kelamin: s.jenis_kelamin,
        raw_detail: {},
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

    if (payload.length > 0) {
      // Non-blocking upsert
      await client.from('students').upsert(payload, { onConflict: 'kode_pt,nim' });
    }
  } catch (err) {
    console.warn('[PDDikti Cache Warning] Gagal menyimpan cache ke Supabase:', err);
  }
}

/**
 * Pencarian Mahasiswa Langsung ke API PDDikti
 * Mendukung pencarian global (tanpa kampus) atau tersaring per kampus
 */
export async function searchStudentsLivePDDikti(params: {
  query: string;
  kode_pt?: string;
  campusName?: string;
  tahun_masuk?: string | number;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<LiveSearchResult> {
  const query = cleanString(params.query);
  const kodePt = cleanString(params.kode_pt);
  const campusName = cleanString(params.campusName);
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 15));

  if (!query && !campusName && !kodePt) {
    return {
      data: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
      isCapped: false,
      source: 'pddikti_live',
      message: 'Masukkan nama mahasiswa atau NIM untuk mencari langsung ke PDDikti.',
    };
  }

  // Siapkan kata kunci pencarian API PDDikti
  let searchKeyword = query;
  if (!searchKeyword && campusName) {
    searchKeyword = campusName;
  }

  const endpoint = `/api/pencarian/mhs/${encodeURIComponent(searchKeyword)}`;
  const { data: rawList, error } = await fetchPDDiktiJson<PDDiktiStudentRaw[]>(endpoint, 10000);

  if (error || !rawList) {
    throw new Error(error || 'Tidak menerima data dari API PDDikti');
  }

  const isCapped = rawList.length >= 100;

  // Resolusi nama kampus dan kode PT untuk validasi ketat jika kampus dipilih
  let normTargetPt = '';
  let normTargetSingkat = '';
  if (campusName) {
    normTargetPt = normalizeCampusName(campusName);
  }

  // Jika kode_pt diberikan tapi campusName belum, cari nama institusi di database Supabase
  let resolvedKodePt = kodePt;
  let resolvedNamaPt = campusName;

  if (kodePt && !campusName) {
    try {
      const client = getSupabaseServerClient();
      if (client) {
        const { data: inst } = await client
          .from('institutions')
          .select('kode_pt, nama, nama_singkat')
          .eq('kode_pt', kodePt)
          .single();
        if (inst) {
          resolvedNamaPt = inst.nama;
          normTargetPt = normalizeCampusName(inst.nama);
          if (inst.nama_singkat) normTargetSingkat = normalizeCampusName(inst.nama_singkat);
        }
      }
    } catch {
      // abaikan jika gagal lookup
    }
  }

  // Filter hasil dari respons API PDDikti
  const filteredStudents: StudentPublic[] = [];
  const seenNims = new Set<string>();

  for (const item of rawList) {
    const nim = cleanString(item.nim);
    const nama = cleanString(item.nama);
    const studentPt = cleanString(item.nama_pt);
    const studentSingkat = cleanString(item.sinkatan_pt || item.singkatan_pt);
    const prodi = cleanString(item.nama_prodi) || '-';

    if (!nim || !nama) continue;

    // Filter Kampus Ketat jika pengguna memilih kampus tertentu
    if (normTargetPt) {
      const normStudentPt = normalizeCampusName(studentPt);
      const normStudentSingkat = normalizeCampusName(studentSingkat);
      const matchesCampus =
        normStudentPt === normTargetPt ||
        (normTargetSingkat && normStudentSingkat === normTargetSingkat);

      if (!matchesCampus) {
        continue; // Lewati mahasiswa kampus lain
      }
    }

    // Filter Tahun Masuk (jika dipilih)
    const tahunMasuk = inferTahunMasuk(nim);
    if (params.tahun_masuk && String(params.tahun_masuk).trim() !== '') {
      const reqYear = Number(params.tahun_masuk);
      if (!isNaN(reqYear) && tahunMasuk !== reqYear) {
        continue;
      }
    }

    // Filter Status (jika dipilih)
    const studentStatus = 'Aktif';
    if (params.status && params.status.trim() !== '') {
      if (params.status.trim().toLowerCase() !== studentStatus.toLowerCase()) {
        continue;
      }
    }

    // Deduplikasi intra-hasil
    const dedupeKey = `${nim}-${studentPt}`;
    if (seenNims.has(dedupeKey)) continue;
    seenNims.add(dedupeKey);

    filteredStudents.push({
      id: item.id || `live-${nim}-${resolvedKodePt || '000000'}`,
      kode_pt: resolvedKodePt || '000000',
      nama_pt: studentPt || resolvedNamaPt || 'Perguruan Tinggi',
      nim,
      nama,
      prodi,
      jenjang: null,
      status: studentStatus,
      tanggal_masuk: null,
      tahun_masuk: tahunMasuk,
      jenis_kelamin: null,
      synced_at: new Date().toISOString(),
    });
  }

  // Simpan cache ke Supabase secara aman di latar belakang
  cacheStudentsToSupabase(filteredStudents).catch(() => {});

  const totalCount = filteredStudents.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize;
  const paginatedData = filteredStudents.slice(from, to);

  return {
    data: paginatedData,
    totalCount,
    page,
    pageSize,
    totalPages,
    isCapped,
    source: 'pddikti_live',
    message: isCapped
      ? 'Hasil pencarian API PDDikti dibatasi maksimal 100 data oleh kementerian. Gunakan kata kunci yang lebih spesifik untuk mempersempit hasil.'
      : undefined,
  };
}
