import { StudentPublic } from '@/lib/types';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import acehInstitutionsData from '@/lib/data/aceh-institutions.json';

const BASE_URL = 'https://pddikti.kemdiktisaintek.go.id';

export interface AcehInstitutionEntry {
  kode_pt: string;
  nama: string;
  nama_singkat: string | null;
}

const acehInstitutions: AcehInstitutionEntry[] = acehInstitutionsData;

export function expandAcronyms(str?: string | null): string {
  if (!str) return '';
  let s = ' ' + normalizeCampusName(str) + ' ';
  const map: Array<[RegExp, string]> = [
    [/\bSTIKES\b/g, 'SEKOLAH TINGGI ILMU KESEHATAN'],
    [/\bSTIM\b/g, 'SEKOLAH TINGGI ILMU MANAJEMEN'],
    [/\bSTKIP\b/g, 'SEKOLAH TINGGI KEGURUAN DAN ILMU PENDIDIKAN'],
    [/\bSTAI\b/g, 'SEKOLAH TINGGI AGAMA ISLAM'],
    [/\bSTAIN\b/g, 'SEKOLAH TINGGI AGAMA ISLAM NEGERI'],
    [/\bIAI\b/g, 'INSTITUT AGAMA ISLAM'],
    [/\bIAIN\b/g, 'INSTITUT AGAMA ISLAM NEGERI'],
    [/\bUIN\b/g, 'UNIVERSITAS ISLAM NEGERI'],
    [/\bUNIV\b/g, 'UNIVERSITAS'],
    [/\bPOLTEK\b/g, 'POLITEKNIK'],
    [/\bAKBID\b/g, 'AKADEMI KEBIDANAN'],
    [/\bAKPER\b/g, 'AKADEMI KEPERAWATAN'],
    [/\bAKFAR\b/g, 'AKADEMI FARMASI'],
    [/\bPOLTEKKES\b/g, 'POLITEKNIK KESEHATAN'],
  ];
  for (const [rgx, rep] of map) {
    s = s.replace(rgx, rep);
  }
  return normalizeCampusName(s);
}

const acehNormMap = new Map<string, AcehInstitutionEntry>();
const acehExpandedMap = new Map<string, AcehInstitutionEntry>();

const acehList = acehInstitutions.map((inst) => {
  const normNama = normalizeCampusName(inst.nama);
  const expNama = expandAcronyms(inst.nama);
  const normSingkat = inst.nama_singkat ? normalizeCampusName(inst.nama_singkat) : '';
  const expSingkat = inst.nama_singkat ? expandAcronyms(inst.nama_singkat) : '';

  if (normNama) acehNormMap.set(normNama, inst);
  if (normSingkat) acehNormMap.set(normSingkat, inst);
  if (expNama) acehExpandedMap.set(expNama, inst);
  if (expSingkat) acehExpandedMap.set(expSingkat, inst);

  return {
    ...inst,
    normNama,
    expNama,
    normSingkat,
    expSingkat,
  };
});

export function findAcehInstitution(
  namaPt?: string | null,
  sinkatanPt?: string | null
): AcehInstitutionEntry | null {
  const normPt = normalizeCampusName(namaPt);
  const expPt = expandAcronyms(namaPt);
  const normSingkat = normalizeCampusName(sinkatanPt);
  const expSingkat = expandAcronyms(sinkatanPt);

  if (normPt && acehNormMap.has(normPt)) return acehNormMap.get(normPt)!;
  if (expPt && acehExpandedMap.has(expPt)) return acehExpandedMap.get(expPt)!;
  if (normSingkat && acehNormMap.has(normSingkat)) return acehNormMap.get(normSingkat)!;
  if (expSingkat && acehExpandedMap.has(expSingkat)) return acehExpandedMap.get(expSingkat)!;

  // Substring checks both normal and expanded
  for (const inst of acehList) {
    if (inst.normNama && normPt) {
      if (normPt.includes(inst.normNama) || inst.normNama.includes(normPt)) {
        return inst;
      }
    }
    if (inst.expNama && expPt) {
      if (expPt.includes(inst.expNama) || inst.expNama.includes(expPt)) {
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
  id_mhs?: string;
  nama?: string;
  nama_mahasiswa?: string;
  nama_mhs?: string;
  nim?: string;
  nomor_induk?: string;
  nama_pt?: string;
  namapt?: string;
  pt?: string;
  perguruan_tinggi?: string;
  sinkatan_pt?: string;
  singkatan_pt?: string;
  singkatan?: string;
  nama_prodi?: string;
  namaprodi?: string;
  prodi?: string;
  program_studi?: string;
}

export function extractStudentFields(item: PDDiktiStudentRaw) {
  const nama = cleanString(item.nama || item.nama_mahasiswa || item.nama_mhs);
  const nim = cleanString(item.nim || item.nomor_induk);
  const namaPt = cleanString(item.nama_pt || item.namapt || item.pt || item.perguruan_tinggi);
  const singkatanPt = cleanString(item.sinkatan_pt || item.singkatan_pt || item.singkatan);
  const prodi = cleanString(item.nama_prodi || item.namaprodi || item.prodi || item.program_studi) || '-';
  const id = cleanString(item.id || item.id_mhs);
  return { nama, nim, namaPt, singkatanPt, prodi, id };
}

export interface LiveSearchResult {
  data: StudentPublic[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isCapped: boolean;
  source: 'pddikti_live' | 'supabase_db';
  gatewayUsed?: string;
  message?: string;
}

interface GatewayConfig {
  name: string;
  getUrl: (kw: string) => string;
  headers?: Record<string, string>;
}

const GATEWAYS: GatewayConfig[] = [
  // 1. Gateway Utama (Sivitas API Primary): pddikti.rone.dev
  {
    name: 'pddikti.rone.dev (Sivitas API)',
    getUrl: (kw: string) => `https://pddikti.rone.dev/api/search/mhs/${encodeURIComponent(kw)}/`,
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DirektoriMahasiswaAceh/1.0',
    },
  },
  // 2. Gateway Alternatif (Sivitas API Fallback): pddikti.fastapicloud.dev
  {
    name: 'pddikti.fastapicloud.dev (Sivitas Fallback)',
    getUrl: (kw: string) => `https://pddikti.fastapicloud.dev/api/search/mhs/${encodeURIComponent(kw)}/`,
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DirektoriMahasiswaAceh/1.0',
    },
  },
  // 3. Upstream Langsung: pddikti.kemdiktisaintek.go.id
  {
    name: 'pddikti.kemdiktisaintek.go.id (Official Public API)',
    getUrl: (kw: string) => `https://pddikti.kemdiktisaintek.go.id/api/pencarian/mhs/${encodeURIComponent(kw)}`,
    headers: HEADERS,
  },
];

/**
 * Panggil gateway pencarian secara berjenjang (Priority 1 -> 2 -> 3)
 */
async function fetchStudentsFromAnyGateway(
  keyword: string,
  timeoutMs = 7000
): Promise<{
  data: PDDiktiStudentRaw[] | null;
  gatewayUsed?: string;
  error?: string;
  details?: Record<string, string>;
}> {
  const errors: Record<string, string> = {};

  for (const gw of GATEWAYS) {
    const url = gw.getUrl(keyword);
    console.log(`[PDDikti Multi-Gateway] Menghubungi: ${gw.name}...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        headers: gw.headers || { 'Accept': 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeoutId);

      const status = res.status;
      if (!res.ok) {
        let errSnippet = `HTTP ${status}`;
        try {
          const errJson = await res.json();
          if (errJson?.status?.message) {
            errSnippet += ` (${errJson.status.message})`;
          } else if (errJson?.message) {
            errSnippet += ` (${errJson.message})`;
          }
        } catch {
          if (res.headers.get('cf-mitigated') === 'challenge') {
            errSnippet += ' (Cloudflare Managed Challenge / Bot Protection)';
          }
        }
        console.warn(`[PDDikti Multi-Gateway] ${gw.name} gagal: ${errSnippet}`);
        errors[gw.name] = errSnippet;
        continue;
      }

      // Berhasil 200 OK
      const json = await res.json();
      let rawList: PDDiktiStudentRaw[] = [];
      if (Array.isArray(json)) {
        rawList = json;
      } else if (Array.isArray(json.data)) {
        rawList = json.data;
      } else if (json.data && Array.isArray(json.data.mahasiswa)) {
        rawList = json.data.mahasiswa;
      } else if (Array.isArray(json.mahasiswa)) {
        rawList = json.mahasiswa;
      }

      console.log(`[PDDikti Multi-Gateway] ${gw.name} BERHASIL: menerima ${rawList.length} data mahasiswa mentah.`);
      return {
        data: rawList,
        gatewayUsed: gw.name,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const msg = err instanceof Error
        ? (err.name === 'AbortError' ? `Timeout > ${timeoutMs / 1000}s` : err.message)
        : String(err);
      console.warn(`[PDDikti Multi-Gateway] ${gw.name} exception: ${msg}`);
      errors[gw.name] = msg;
    }
  }

  // Jika semua gateway gagal
  const detailList = Object.entries(errors)
    .map(([gwName, errMsg]) => `${gwName}: ${errMsg}`)
    .join(' | ');

  return {
    data: null,
    error: `Semua gateway API PDDikti gagal diakses (${detailList}). Silakan gunakan opsi pencarian arsip database terverifikasi.`,
    details: errors,
  };
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

  const { data: rawList, error, gatewayUsed } = await fetchStudentsFromAnyGateway(searchKeyword, 7000);

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
    const { nama, nim, namaPt: studentPt, singkatanPt: studentSingkat, prodi, id: rawId } = extractStudentFields(item);

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

    // Deduplikasi intra-hasil
    const dedupeKey = `${nim}-${studentPt}`;
    if (seenNims.has(dedupeKey)) continue;
    seenNims.add(dedupeKey);

    const studentKodePt = resolvedKodePt || matchedAcehInst?.kode_pt || '000000';
    const studentNamaPt = studentPt || resolvedNamaPt || matchedAcehInst?.nama || 'Perguruan Tinggi';

    filteredStudents.push({
      id: rawId || `live-${nim}-${studentKodePt}`,
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
    gatewayUsed,
    message: isCapped
      ? 'Hasil pencarian API PDDikti dibatasi maksimal 100 data oleh kementerian. Gunakan kata kunci yang lebih spesifik untuk mempersempit hasil.'
      : undefined,
  };
}
