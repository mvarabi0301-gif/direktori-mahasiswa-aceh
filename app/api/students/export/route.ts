import { NextRequest, NextResponse } from 'next/server';
import { queryAllStudentsForExport } from '@/lib/data/students';
import { searchStudentsLivePDDikti } from '@/lib/pddikti/client';
import { StudentPublic } from '@/lib/types';

export const dynamic = 'force-dynamic';

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const kode_pt = searchParams.get('kode_pt') || '';
    const campusName = searchParams.get('nama_pt') || '';
    const tahun_masuk = searchParams.get('tahun_masuk') || '';
    const status = searchParams.get('status') || '';

    let students: StudentPublic[] = [];

    // Jika sedang dalam pencarian langsung PDDikti, ekspor hasil live PDDikti
    if (query.trim() !== '') {
      const liveRes = await searchStudentsLivePDDikti({
        query: query.trim(),
        kode_pt: kode_pt.trim(),
        campusName: campusName.trim(),
        tahun_masuk,
        status,
        page: 1,
        pageSize: 100,
      });
      students = liveRes.data;
    } else {
      // Jika penelusuran kampus / seluruh data, ekspor seluruh data yang cocok
      students = await queryAllStudentsForExport({
        query: '',
        kode_pt: kode_pt.trim(),
        tahun_masuk,
        status,
      });
    }

    const headers = [
      'NIM',
      'Nama Mahasiswa',
      'Perguruan Tinggi',
      'Kode PT',
      'Jenjang',
      'Program Studi',
      'Tahun Masuk',
      'Tanggal Masuk',
      'Status Mahasiswa',
      'Jenis Kelamin',
    ];

    const rows = students.map((s) => [
      escapeCsvCell(s.nim),
      escapeCsvCell(s.nama),
      escapeCsvCell(s.nama_pt),
      escapeCsvCell(s.kode_pt),
      escapeCsvCell(s.jenjang || '-'),
      escapeCsvCell(s.prodi || '-'),
      escapeCsvCell(s.tahun_masuk || '-'),
      escapeCsvCell(s.tanggal_masuk || '-'),
      escapeCsvCell(s.status || '-'),
      escapeCsvCell(s.jenis_kelamin || '-'),
    ]);

    const csvContent = '\uFEFF' + [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((r) => r.join(',')),
    ].join('\r\n');

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `direktori-mahasiswa-aceh-${timestamp}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal menghasilkan ekspor CSV';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
