import { NextRequest, NextResponse } from 'next/server';
import { fetchFilterMetadata } from '@/lib/data/students';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const kode_pt = searchParams.get('kode_pt') || undefined;
    const filters = await fetchFilterMetadata(kode_pt);
    return NextResponse.json(filters);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal mengambil metadata filter';
    return NextResponse.json({ years: [], statuses: [], error: message }, { status: 500 });
  }
}
