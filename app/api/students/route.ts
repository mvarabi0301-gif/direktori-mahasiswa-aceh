import { NextRequest, NextResponse } from 'next/server';
import { queryStudents } from '@/lib/data/students';
import { searchStudentsLivePDDikti } from '@/lib/pddikti/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q') || '';
  const kode_pt = searchParams.get('kode_pt') || '';
  const campusName = searchParams.get('nama_pt') || '';
  const tahun_masuk = searchParams.get('tahun_masuk') || '';
  const status = searchParams.get('status') || '';
  const sourceParam = searchParams.get('source') || 'auto';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('page_size') || '15', 10);

  // --- A. Jika user memasukkan query dan mode bukan paksa 'supabase', coba live dulu ---
  if (query.trim() !== '' && sourceParam !== 'supabase') {
    let liveError: string | null = null;
    let gatewayUsed: string | undefined;

    try {
      const liveResult = await searchStudentsLivePDDikti({
        query: query.trim(),
        kode_pt: kode_pt.trim(),
        campusName: campusName.trim(),
        tahun_masuk,
        status,
        page,
        pageSize,
      });

      // Live berhasil dan ada data — kembalikan langsung
      if (liveResult.data && liveResult.data.length > 0) {
        return NextResponse.json(liveResult);
      }

      // Live berhasil tapi data kosong — tandai supaya fallback ke Supabase
      liveError = null; // tidak error, tapi kosong → akan fallback juga
      gatewayUsed = liveResult.gatewayUsed;
    } catch (err) {
      // Live gagal (403, 503, timeout, DNS, dll) — auto fallback
      liveError = err instanceof Error ? err.message : String(err);
      console.warn('[API /api/students] Live PDDikti gagal, auto-fallback ke Supabase:', liveError?.slice(0, 120));
    }

    // --- AUTO-FALLBACK: Cari di Supabase dengan keyword yang sama ---
    try {
      const fallbackResult = await queryStudents({
        query: query.trim(),
        kode_pt: kode_pt.trim(),
        tahun_masuk,
        status,
        page,
        pageSize,
      });

      const fallbackNotice = liveError
        ? `Pencarian langsung PDDikti tidak tersedia (${liveError.slice(0, 80)}). Menampilkan hasil dari arsip database terverifikasi.`
        : `Tidak ada hasil dari pencarian langsung PDDikti. Menampilkan hasil dari arsip database terverifikasi.`;

      return NextResponse.json({
        ...fallbackResult,
        source: 'supabase_db' as const,
        isCapped: false,
        gatewayFailed: liveError || 'Tidak ada data dari live API',
        message: fallbackResult.totalCount === 0
          ? 'Tidak ditemukan hasil yang cocok di arsip database maupun pencarian langsung PDDikti.'
          : fallbackNotice,
      });
    } catch (dbErr) {
      const dbErrMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.error('[API /api/students] Supabase juga gagal:', dbErrMsg);
      return NextResponse.json(
        {
          data: [],
          totalCount: 0,
          page: 1,
          pageSize,
          totalPages: 0,
          isConfigured: true,
          source: 'supabase_db',
          message: `Pencarian langsung PDDikti gagal dan arsip database juga tidak dapat diakses saat ini. Coba lagi beberapa saat. (DB: ${dbErrMsg.slice(0, 100)})`,
          error: dbErrMsg,
        },
        { status: 503 }
      );
    }
  }

  // --- B. Tampilkan data dari Supabase (pencarian arsip paksa, atau penelusuran per kampus) ---
  try {
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
    const message = error instanceof Error ? error.message : 'Terjadi kesalahan saat memproses data mahasiswa';
    console.error('[API /api/students] Gagal memproses permintaan:', message);
    return NextResponse.json(
      {
        data: [],
        totalCount: 0,
        page: 1,
        pageSize,
        totalPages: 0,
        isConfigured: true,
        source: 'supabase_db',
        message,
        error: message,
      },
      { status: 503 }
    );
  }
}
