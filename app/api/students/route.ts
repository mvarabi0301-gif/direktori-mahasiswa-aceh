import { NextRequest, NextResponse } from 'next/server';
import { queryStudents } from '@/lib/data/students';
import { searchStudentsLivePDDikti } from '@/lib/pddikti/client';

export const dynamic = 'force-dynamic';

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

    // First attempt live PDDikti search when a query is provided and source is not forced to supabase
    let noticeMessage: string | null = null;
    if (query.trim() !== '' && sourceParam !== 'supabase') {
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
        // If live returns data, use it directly
        if (liveResult.data && liveResult.data.length > 0) {
          return NextResponse.json(liveResult);
        }
        // No data from live API – fall back to Supabase automatically
        noticeMessage =
          'Tidak ada hasil dari API PDDikti, menampilkan hasil dari arsip database terverifikasi.';
      } catch (liveErr) {
        // Live API failed – capture message and continue to fallback
        noticeMessage =
          liveErr instanceof Error
            ? `PDDikti tidak dapat diakses: ${liveErr.message}`
            : 'PDDikti tidak dapat diakses: error tak dikenal.';
      }
    }

    // Fallback – query Supabase (archive) whether live failed or returned no data
    const result = await queryStudents({
      query: query.trim(), // Supabase handles empty query internally
      kode_pt,
      tahun_masuk,
      status,
      page,
      pageSize,
    });

    // Merge fallback notice (if any) and mark source as supabase_db
    return NextResponse.json({
      ...result,
      source: 'supabase_db',
      message: noticeMessage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Terjadi kesalahan saat memproses data mahasiswa';
    console.error('[API /api/students] Gagal memproses permintaan pencarian:', message);
    return NextResponse.json(
      {
        data: [],
        totalCount: 0,
        page: 1,
        pageSize: 15,
        totalPages: 0,
        isConfigured: true,
        source: 'pddikti_live',
        message,
        error: message,
      },
      { status: 502 },
    );
  }
}
