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
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('page_size') || '15', 10);

    // B.1 & B.4: Jika pengguna mengetik nama mahasiswa atau NIM, panggil API PDDikti secara live!
    if (query.trim() !== '') {
      const liveResult = await searchStudentsLivePDDikti({
        query: query.trim(),
        kode_pt: kode_pt.trim(),
        campusName: campusName.trim(),
        tahun_masuk,
        status,
        page,
        pageSize,
      });

      return NextResponse.json(liveResult);
    }

    // Jika pengguna memilih kampus tanpa mengetik nama:
    // Tampilkan data mahasiswa terverifikasi dari Supabase
    const result = await queryStudents({
      query: '',
      kode_pt,
      tahun_masuk,
      status,
      page,
      pageSize,
    });

    return NextResponse.json({
      ...result,
      source: 'supabase_db',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Terjadi kesalahan saat memproses data mahasiswa';
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
      { status: 500 }
    );
  }
}
