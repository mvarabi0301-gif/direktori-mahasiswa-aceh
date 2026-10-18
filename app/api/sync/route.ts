import { NextRequest, NextResponse } from 'next/server';
import { runTargetedSync } from '@/lib/sync/sync-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const syncSecret = process.env.SYNC_SECRET_TOKEN;
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    // Autentikasi proteksi endpoint
    if (syncSecret && token !== syncSecret) {
      return NextResponse.json({ error: 'Tidak memiliki izin (Unauthorized)' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const campusKeyword = body.campusKeyword || body.campus || undefined;
    const studentKeyword = body.studentKeyword || body.mhs || undefined;
    const maxStudentsToProcess = Math.min(100, Math.max(1, body.maxStudents || 10));

    if (!campusKeyword && !studentKeyword) {
      return NextResponse.json(
        { error: 'Harap sertakan minimal campusKeyword atau studentKeyword dalam body permintaan.' },
        { status: 400 }
      );
    }

    const result = await runTargetedSync({
      campusKeyword,
      studentKeyword,
      maxStudentsToProcess,
      fetchDetails: true,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Terjadi kegagalan sinkronisasi';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
