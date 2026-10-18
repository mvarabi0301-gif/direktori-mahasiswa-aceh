import { NextRequest, NextResponse } from 'next/server';
import { fetchInstitutions } from '@/lib/data/students';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q') || '';
    const institutions = await fetchInstitutions(q);
    return NextResponse.json({ institutions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal mengambil data kampus';
    return NextResponse.json({ institutions: [], error: message }, { status: 500 });
  }
}
