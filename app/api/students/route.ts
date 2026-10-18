import { NextRequest, NextResponse } from 'next/server';
import { queryStudents } from '@/lib/data/students';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const kode_pt = searchParams.get('kode_pt') || '';
    const tahun_masuk = searchParams.get('tahun_masuk') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('page_size') || '15', 10);

    const result = await queryStudents({
      query,
      kode_pt,
      tahun_masuk,
      status,
      page,
      pageSize,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Terjadi kesalahan internal server';
    return NextResponse.json(
      {
        data: [],
        totalCount: 0,
        page: 1,
        pageSize: 15,
        totalPages: 0,
        isConfigured: false,
        message,
      },
      { status: 500 }
    );
  }
}
