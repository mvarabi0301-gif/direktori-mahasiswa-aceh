import { NextRequest, NextResponse } from 'next/server';
import { queryStudents } from '@/lib/data/students';
import { inferTahunMasuk, cleanString } from '@/lib/pddikti/client';
import { StudentPublic } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Memanggil edge proxy /api/pddikti-search secara internal.
 * Edge proxy berjalan di edge runtime dengan IP lebih variatif.
 */
async function fetchViaPDDiktiEdgeProxy(
  keyword: string,
  filterAceh: boolean,
  baseUrl: string
): Promise<{
  status: 'success' | 'error';
  data: Array<{
    id?: string;
    nama?: string;
    nim?: string;
    nama_pt?: string;
    sinkatan_pt?: string;
    singkatan_pt?: string;
    nama_prodi?: string;
  }>;
  totalRaw?: number;
  totalAceh?: number;
  isCapped?: boolean;
  message?: string;
  httpStatus?: number;
}> {
  const params = new URLSearchParams({
    q: keyword,
    filter_aceh: filterAceh ? 'true' : 'false',
  });
  const res = await fetch(`${baseUrl}/api/pddikti-search?${params}`, {
    headers: { 'x-internal-call': '1' },
  });
  return res.json();
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const kode_pt = searchParams.get('kode_pt') || '';
    const campusName = searchParams.get('nama_pt') || '';
    const tahun_masuk = searchParams.get('tahun_masuk') || '';
    const status = searchParams.get('status') || '';
    const sourceParam = searchParams.get('source') || 'auto';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('page_size') || '15', 10);

    // Pencarian langsung PDDikti melalui Edge Proxy
    if (query.trim() !== '' && sourceParam !== 'supabase') {
      // Tentukan baseUrl untuk internal fetch
      const host = request.headers.get('host') || 'localhost:3000';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      const baseUrl = `${protocol}://${host}`;

      // Filter ke Aceh hanya jika tidak ada kampus spesifik dipilih
      const filterAceh = !kode_pt.trim();

      const proxyResult = await fetchViaPDDiktiEdgeProxy(query.trim(), filterAceh, baseUrl);

      if (proxyResult.status === 'error') {
        // PDDikti tidak bisa diakses — lempar error agar UI menampilkan fallback
        return NextResponse.json(
          {
            data: [],
            totalCount: 0,
            page,
            pageSize,
            totalPages: 0,
            isConfigured: true,
            source: 'pddikti_live' as const,
            message: proxyResult.message || 'Pencarian PDDikti gagal.',
            error: proxyResult.message,
            httpStatus: proxyResult.httpStatus,
          },
          { status: 200 }
        );
      }

      // Proses & petakan hasil PDDikti ke StudentPublic
      const rawList = proxyResult.data || [];
      const filteredStudents: StudentPublic[] = [];
      const seenNims = new Set<string>();

      for (const item of rawList) {
        const nim = cleanString(item.nim);
        const nama = cleanString(item.nama);
        const studentPt = cleanString(item.nama_pt);
        const prodi = cleanString(item.nama_prodi) || '-';

        if (!nim || !nama) continue;

        // Filter kampus ketat jika kode_pt dipilih
        if (kode_pt.trim() && campusName.trim()) {
          const normTarget = campusName.toUpperCase().replace(/\s+/g, ' ').replace(/[^A-Z0-9 ]/g, '').trim();
          const normStudent = studentPt.toUpperCase().replace(/\s+/g, ' ').replace(/[^A-Z0-9 ]/g, '').trim();
          if (normStudent !== normTarget) continue;
        }

        // Filter tahun masuk jika ada
        const tahunMasuk = inferTahunMasuk(nim);
        if (tahun_masuk && String(tahun_masuk).trim() !== '') {
          const reqYear = Number(tahun_masuk);
          if (!isNaN(reqYear) && tahunMasuk !== reqYear) continue;
        }

        // Filter status (PDDikti tidak menyediakan status, default Aktif)
        const studentStatus = 'Aktif';
        if (status && status.trim() !== '') {
          if (status.trim().toLowerCase() !== studentStatus.toLowerCase()) continue;
        }

        // Dedup
        const dedupeKey = `${nim}-${studentPt}`;
        if (seenNims.has(dedupeKey)) continue;
        seenNims.add(dedupeKey);

        filteredStudents.push({
          id: item.id || `live-${nim}`,
          kode_pt: kode_pt || '000000',
          nama_pt: studentPt || campusName || 'Perguruan Tinggi',
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

      const totalCount = filteredStudents.length;
      const totalPages = Math.ceil(totalCount / pageSize);
      const from = (page - 1) * pageSize;
      const paginatedData = filteredStudents.slice(from, from + pageSize);

      return NextResponse.json({
        data: paginatedData,
        totalCount,
        page,
        pageSize,
        totalPages,
        isConfigured: true,
        isCapped: proxyResult.isCapped,
        source: 'pddikti_live' as const,
        message: proxyResult.isCapped
          ? 'Hasil dibatasi 100 data oleh API PDDikti. Gunakan kata kunci lebih spesifik.'
          : undefined,
      });
    }

    // Tampilkan data dari Supabase (browse kampus / pencarian arsip)
    const result = await queryStudents({
      query: sourceParam === 'supabase' ? query.trim() : '',
      kode_pt,
      tahun_masuk,
      status,
      page,
      pageSize,
    });

    return NextResponse.json({
      ...result,
      source: 'supabase_db' as const,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Terjadi kesalahan saat memproses data mahasiswa';
    return NextResponse.json(
      {
        data: [],
        totalCount: 0,
        page: 1,
        pageSize: 15,
        totalPages: 0,
        isConfigured: true,
        source: 'pddikti_live' as const,
        message,
        error: message,
      },
      { status: 500 }
    );
  }
}
