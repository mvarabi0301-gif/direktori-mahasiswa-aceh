import { getSupabaseServerClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import { Institution, StudentPublic, StudentQueryParams, StudentQueryResult, FilterOptions } from '@/lib/types';

const DEFAULT_PAGE_SIZE = 15;
const MAX_EXPORT_LIMIT = 20000;

export async function queryStudents(params: StudentQueryParams): Promise<StudentQueryResult> {
  if (!isSupabaseServerConfigured()) {
    return {
      data: [],
      totalCount: 0,
      page: params.page || 1,
      pageSize: params.pageSize || DEFAULT_PAGE_SIZE,
      totalPages: 0,
      isConfigured: false,
      message: 'Koneksi Supabase belum dikonfigurasi. Harap lengkapi NEXT_PUBLIC_SUPABASE_URL dan kredensial di file .env.local.',
    };
  }

  const client = getSupabaseServerClient();
  if (!client) {
    return {
      data: [],
      totalCount: 0,
      page: params.page || 1,
      pageSize: params.pageSize || DEFAULT_PAGE_SIZE,
      totalPages: 0,
      isConfigured: false,
      message: 'Gagal menginisialisasi client Supabase.',
    };
  }

  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || DEFAULT_PAGE_SIZE));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = client
    .from('students')
    .select('id, kode_pt, nama_pt, nim, nama, prodi, jenjang, status, tanggal_masuk, tahun_masuk, jenis_kelamin, synced_at', {
      count: 'exact',
    });

  // Filter Kampus (Jika dipilih)
  if (params.kode_pt && params.kode_pt.trim() !== '') {
    query = query.eq('kode_pt', params.kode_pt.trim());
  }

  // Filter Keyword Pencarian (Nama Mahasiswa ATAU NIM)
  if (params.query && params.query.trim() !== '') {
    const rawQ = params.query.trim().replace(/[%_]/g, '\\$&'); // Sanitize SQL like wildcards
    query = query.or(`nama.ilike.%${rawQ}%,nim.ilike.%${rawQ}%`);
  }

  // Filter Tahun Masuk
  if (params.tahun_masuk && String(params.tahun_masuk).trim() !== '') {
    const year = Number(params.tahun_masuk);
    if (!isNaN(year)) {
      query = query.eq('tahun_masuk', year);
    }
  }

  // Filter Status Mahasiswa
  if (params.status && params.status.trim() !== '') {
    query = query.eq('status', params.status.trim());
  }

  // Sorting dan Pagination
  query = query.order('nama', { ascending: true }).range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error('[DATABASE ERROR] Gagal mengambil data mahasiswa:', error.message);
    return {
      data: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
      isConfigured: true,
      message: `Terjadi kendala saat membaca data: ${error.message}`,
    };
  }

  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return {
    data: (data || []) as StudentPublic[],
    totalCount,
    page,
    pageSize,
    totalPages,
    isConfigured: true,
  };
}

export async function queryAllStudentsForExport(params: Omit<StudentQueryParams, 'page' | 'pageSize'>): Promise<StudentPublic[]> {
  const client = getSupabaseServerClient();
  if (!client) return [];

  let query = client
    .from('students')
    .select('id, kode_pt, nama_pt, nim, nama, prodi, jenjang, status, tanggal_masuk, tahun_masuk, jenis_kelamin, synced_at');

  if (params.kode_pt && params.kode_pt.trim() !== '') {
    query = query.eq('kode_pt', params.kode_pt.trim());
  }

  if (params.query && params.query.trim() !== '') {
    const rawQ = params.query.trim().replace(/[%_]/g, '\\$&');
    query = query.or(`nama.ilike.%${rawQ}%,nim.ilike.%${rawQ}%`);
  }

  if (params.tahun_masuk && String(params.tahun_masuk).trim() !== '') {
    const year = Number(params.tahun_masuk);
    if (!isNaN(year)) {
      query = query.eq('tahun_masuk', year);
    }
  }

  if (params.status && params.status.trim() !== '') {
    query = query.eq('status', params.status.trim());
  }

  query = query.order('nama', { ascending: true }).limit(MAX_EXPORT_LIMIT);

  const { data, error } = await query;
  if (error) {
    console.error('[EXPORT ERROR] Gagal mengambil seluruh data untuk CSV:', error.message);
    return [];
  }

  return (data || []) as StudentPublic[];
}

export async function fetchInstitutions(searchQuery?: string): Promise<Institution[]> {
  const client = getSupabaseServerClient();
  if (!client) return [];

  let query = client
    .from('institutions')
    .select('kode_pt, nama, nama_singkat')
    .order('nama', { ascending: true });

  if (searchQuery && searchQuery.trim() !== '') {
    const rawQ = searchQuery.trim().replace(/[%_]/g, '\\$&');
    query = query.or(`nama.ilike.%${rawQ}%,nama_singkat.ilike.%${rawQ}%,kode_pt.ilike.%${rawQ}%`);
  }

  const { data, error } = await query.limit(300);
  if (error) {
    console.error('[INSTITUTIONS ERROR] Gagal mengambil data kampus:', error.message);
    return [];
  }

  return (data || []) as Institution[];
}

export async function fetchFilterMetadata(kode_pt?: string): Promise<FilterOptions> {
  const client = getSupabaseServerClient();
  if (!client) {
    return { years: [], statuses: [] };
  }

  try {
    let yearQuery = client
      .from('students')
      .select('tahun_masuk')
      .not('tahun_masuk', 'is', null);

    let statusQuery = client
      .from('students')
      .select('status')
      .not('status', 'is', null);

    if (kode_pt && kode_pt.trim() !== '') {
      yearQuery = yearQuery.eq('kode_pt', kode_pt.trim());
      statusQuery = statusQuery.eq('kode_pt', kode_pt.trim());
    }

    const [yearsRes, statusRes] = await Promise.all([
      yearQuery.order('tahun_masuk', { ascending: false }).limit(500),
      statusQuery.order('status', { ascending: true }).limit(500),
    ]);

    const uniqueYears = Array.from(
      new Set((yearsRes.data || []).map((row: { tahun_masuk: number | null }) => row.tahun_masuk).filter((y): y is number => typeof y === 'number'))
    ).sort((a, b) => b - a);

    const uniqueStatuses = Array.from(
      new Set((statusRes.data || []).map((row: { status: string | null }) => row.status).filter((s): s is string => typeof s === 'string' && s.trim() !== ''))
    ).sort();

    return {
      years: uniqueYears,
      statuses: uniqueStatuses,
    };
  } catch (err) {
    console.error('[FILTER ERROR] Gagal mengambil opsi filter:', err);
    return { years: [], statuses: [] };
  }
}
