import { StudentPublic } from '@/lib/types';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import acehInstitutionsData from '@/lib/data/aceh-institutions.json';

const DEFAULT_PDDIKTI_BASE = 'https://pddikti.kemdiktisaintek.go.id';

export interface AcehInstitutionEntry {
  kode_pt: string;
  nama: string;
  nama_singkat: string | null;
}

const acehInstitutions: AcehInstitutionEntry[] = acehInstitutionsData;

const acehNormMap = new Map<string, AcehInstitutionEntry>();
const acehList = acehInstitutions.map((inst) => {
  const normNama = normalizeCampusName(inst.nama);
  const normSingkat = inst.nama_singkat ? normalizeCampusName(inst.nama_singkat) : '';
  if (normNama) acehNormMap.set(normNama, inst);
  if (normSingkat) acehNormMap.set(normSingkat, inst);
  return {
    ...inst,
    normNama,
    normSingkat,
  };
});

export function findAcehInstitution(
  namaPt?: string | null,
  sinkatanPt?: string | null
): AcehInstitutionEntry | null {
  const normPt = normalizeCampusName(namaPt);
  const normSingkat = normalizeCampusName(sinkatanPt);

  if (normPt && acehNormMap.has(normPt)) {
    return acehNormMap.get(normPt)!;
  }
  if (normSingkat && acehNormMap.has(normSingkat)) {
    return acehNormMap.get(normSingkat)!;
  }

  // Exact substring check if name contains or is contained in an official Aceh institution
  for (const inst of acehList) {
    if (inst.normNama && normPt) {
      if (normPt.includes(inst.normNama) || inst.normNama.includes(normPt)) {
        return inst;
      }
    }
  }

  return null;
}

const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': `${DEFAULT_PDDIKTI_BASE}/`,
  'Origin': DEFAULT_PDDIKTI_BASE,
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
 * Resolusi URL PDDikti: Menggunakan PDDIKTI_PROXY_URL jika dikonfigurasi, atau langsung ke API PDDikti
 */
export function resolvePDDiktiUrl(endpoint: string): { url: string; isProxied: boolean; headers: Record<string, string> } {
  const proxyUrl = process.env.PDDIKTI_PROXY_URL?.trim();
  const proxyKey = process.env.PDDIKTI_PROXY_KEY?.trim();

  const reqHeaders: Record<string, string> = { ...HEADERS };

  if (proxyUrl) {
    let resolvedUrl: string;
    if (proxyUrl.includes('{endpoint}')) {
      resolvedUrl = proxyUrl.replace('{endpoint}', endpoint.replace(/^\//, ''));
    } else {
      const base = proxyUrl.replace(/\/+$/, '');
      resolvedUrl = `${base}${endpoint}`;
    }

    if (proxyKey) {
      reqHeaders['x-proxy-key'] = proxyKey;
      reqHeaders['Authorization'] = `Bearer ${proxyKey}`;
    }

    return { url: resolvedUrl, isProxied: true, headers: reqHeaders };
  }

  return { url: `${DEFAULT_PDDIKTI_BASE}${endpoint}`, isProxied: false, headers: reqHeaders };
}

/**
 * Membangun strategi query bertarget ke API PDDikti untuk mengatasi batas ~100 data per permintaan
 */
export function buildTargetedSearchQueries(query: string, campusName?: string): string[] {
  const cleanQ = cleanString(query);
  if (!cleanQ) return [];

  // Jika query adalah digit murni (NIM), jangan tambahkan variasi kata kampus
  const isNimQuery = /^\d+$/.test(cleanQ);
  if (isNimQuery) {
    return [cleanQ];
  }

  if (campusName && campusName.trim() !== '') {
    const cleanCampus = campusName.trim();
    const queries = [cleanQ];
    const inst = findAcehInstitution(cleanCampus);
    if (!cleanQ.toLowerCase().includes(cleanCampus.toLowerCase())) {
      queries.push(`${cleanQ} ${cleanCampus}`);
    }
    if (inst?.nama_singkat && !cleanQ.toUpperCase().includes(inst.nama_singkat.toUpperCase())) {
      queries.push(`${cleanQ} ${inst.nama_singkat}`);
    }
    return Array.from(new Set(queries));
  }

  const lowerQ = cleanQ.toLowerCase();
  const variations: string[] = [cleanQ];
  const targets = ['Aceh', 'Syiah Kuala', 'Malikussaleh', 'Teuku Umar', 'Lhokseumawe'];

  for (const t of targets) {
    if (!lowerQ.includes(t.toLowerCase())) {
      variations.push(`${cleanQ} ${t}`);
    }
    if (variations.length >= 5) break;
  }

  return variations;
}

/**
 * Panggil API PDDikti secara langsung atau melalui upstream proxy dengan timeout
 */
async function fetchPDDiktiJson<T>(endpoint: string, timeoutMs = 9000): Promise<{ data: T | null; error?: string }> {
  const { url, isProxied, headers } = resolvePDDiktiUrl(endpoint);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 429) {
        return { data: null, error: 'Batas frekuensi permintaan API PDDikti tercapai (HTTP 429). Silakan tunggu sejenak.' };
      }
      if (res.status === 403) {
        const isChallenge = res.headers.get('cf-mitigated') === 'challenge';
        const detail = isChallenge
          ? 'Proteksi Cloudflare Managed Challenge (WAF Kemdiktisaintek) mendeteksi IP server cloud Vercel'
          : 'Firewall Kemdiktisaintek membatasi akses';

        const proxyHint = isProxied
          ? 'Periksa konfigurasi upstream server proxy Anda.'
          : 'Gunakan tombol arsip database terverifikasi, atau konfigurasikan PDDIKTI_PROXY_URL pada environment variable server jika memiliki upstream proxy berlokasi di Indonesia.';

        return {
          data: null,
          error: `API PDDikti membatasi akses (${detail} - HTTP 403). Pencarian langsung tidak dapat diproses dari server cloud ini. ${proxyHint}`,
        };
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
      await client.from('students').upsert(payload, { onConflict: 'kode_pt,nim' });
    }
  } catch (err) {
    console.warn('[PDDikti Cache Warning] Gagal menyimpan cache ke Supabase:', err);
  }
}

/**
 * Pencarian Mahasiswa Langsung ke API PDDikti
 * Mendukung pencarian bertarget, concurrency terkontrol, deduplikasi akurat, dan validasi institusi Aceh
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

  // Resolusi nama kampus dan kode PT untuk validasi ketat
  let resolvedKodePt = kodePt;
  let resolvedNamaPt = campusName;
  let normTargetPt = campusName ? normalizeCampusName(campusName) : '';
  let targetInst: AcehInstitutionEntry | null = campusName ? findAcehInstitution(campusName) : null;

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
          targetInst = inst;
        }
      }
    } catch {
      // abaikan jika gagal lookup
    }
  }

  if (targetInst && !resolvedKodePt) {
    resolvedKodePt = targetInst.kode_pt;
  }

  const normTargetSingkat = targetInst?.nama_singkat ? normalizeCampusName(targetInst.nama_singkat) : '';

  // Siapkan kata kunci pencarian API PDDikti
  let searchKeyword = query;
  if (!searchKeyword && resolvedNamaPt) {
    searchKeyword = resolvedNamaPt;
  }

  const searchQueries = buildTargetedSearchQueries(searchKeyword, resolvedNamaPt);

  // Jalankan query secara konkuren dengan concurrency limit terkontrol (2 per batch)
  const rawResults: PDDiktiStudentRaw[] = [];
  let anySuccess = false;
  let lastError: string | undefined;
  let isCapped = false;

  const batchSize = 2;
  for (let i = 0; i < searchQueries.length; i += batchSize) {
    const batch = searchQueries.slice(i, i + batchSize);
    const batchPromises = batch.map((kw) => {
      const endpoint = `/api/pencarian/mhs/${encodeURIComponent(kw)}`;
      return fetchPDDiktiJson<PDDiktiStudentRaw[]>(endpoint, 9000);
    });

    const batchResults = await Promise.allSettled(batchPromises);

    for (const res of batchResults) {
      if (res.status === 'fulfilled') {
        if (res.value.data) {
          anySuccess = true;
          const items = Array.isArray(res.value.data) ? res.value.data : [];
          if (items.length >= 100) isCapped = true;
          rawResults.push(...items);
        } else if (res.value.error) {
          lastError = res.value.error;
        }
      } else {
        lastError = res.reason instanceof Error ? res.reason.message : 'Kegagalan permintaan pencarian';
      }
    }

    if (i + batchSize < searchQueries.length) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  if (!anySuccess) {
    throw new Error(lastError || 'Tidak menerima data dari API PDDikti');
  }

  // Filter hasil dari respons API PDDikti dan hilangkan duplikasi
  const filteredStudents: StudentPublic[] = [];
  const seenNims = new Set<string>();

  for (const item of rawResults) {
    const nim = cleanString(item.nim);
    const nama = cleanString(item.nama);
    const studentPt = cleanString(item.nama_pt);
    const studentSingkat = cleanString(item.sinkatan_pt || item.singkatan_pt);
    const prodi = cleanString(item.nama_prodi) || '-';

    if (!nim || !nama) continue;

    // Filter Kampus:
    // A. Jika kampus spesifik dipilih: cocokkan ketat dengan kampus target
    // B. Jika tidak ada kampus dipilih (pencarian global): filter HANYA mahasiswa dari 183 institusi Aceh
    let matchedAcehInst: AcehInstitutionEntry | null = null;

    if (normTargetPt) {
      const normStudentPt = normalizeCampusName(studentPt);
      const normStudentSingkat = normalizeCampusName(studentSingkat);
      const matchesCampus =
        normStudentPt === normTargetPt ||
        (normTargetSingkat && normStudentSingkat === normTargetSingkat);

      if (!matchesCampus) {
        continue; // Lewati mahasiswa kampus lain
      }
      matchedAcehInst = findAcehInstitution(studentPt, studentSingkat) || targetInst;
    } else {
      matchedAcehInst = findAcehInstitution(studentPt, studentSingkat);
      if (!matchedAcehInst) {
        continue; // Lewati mahasiswa perguruan tinggi di luar Aceh
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

    // Deduplikasi intra-hasil berdasarkan NIM dan Identitas Kampus
    const dedupeKey = `${nim.toUpperCase()}-${studentPt.toUpperCase()}`;
    if (seenNims.has(dedupeKey)) continue;
    seenNims.add(dedupeKey);

    const studentKodePt = resolvedKodePt || matchedAcehInst?.kode_pt || '000000';
    const studentNamaPt = studentPt || resolvedNamaPt || matchedAcehInst?.nama || 'Perguruan Tinggi';

    filteredStudents.push({
      id: item.id || `live-${nim}-${studentKodePt}`,
      kode_pt: studentKodePt,
      nama_pt: studentNamaPt,
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
      ? 'Hasil pencarian API PDDikti dibatasi sekitar ~100 data per permintaan oleh kementerian. Gunakan kata kunci yang lebih spesifik untuk mempersempit hasil.'
      : undefined,
  };
}
