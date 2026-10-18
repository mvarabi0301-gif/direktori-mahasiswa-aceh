import { getSupabaseAdminClient } from '@/lib/supabase/server';

const BASE_URL = 'https://pddikti.kemdiktisaintek.go.id';

const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': `${BASE_URL}/`,
  'Origin': BASE_URL,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface SyncTargetOptions {
  campusKeyword?: string;
  targetCampusCode?: string;
  studentKeyword?: string;
  fetchDetails?: boolean;
  maxStudentsToProcess?: number;
}

export interface SyncResult {
  success: boolean;
  runId: string;
  processedCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount?: number;
  message: string;
  errors: string[];
}

function cleanString(str?: string | null): string {
  if (!str) return '';
  return str.trim();
}

function cleanStatus(status?: string | null): string {
  if (!status) return 'Tidak Diketahui';
  let s = status.trim();
  while (s.endsWith('-') || s.endsWith(' ')) {
    s = s.slice(0, -1).trim();
  }
  return s || 'Tidak Diketahui';
}

function extractYear(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})/);
  if (match) {
    const y = parseInt(match[1], 10);
    return isNaN(y) ? null : y;
  }
  return null;
}

// 23 Kabupaten/Kota resmi di Provinsi Aceh
export const ACEH_KAB_KOTA_LIST = [
  'Kab. Aceh Barat',
  'Kab. Aceh Barat Daya',
  'Kab. Aceh Besar',
  'Kab. Aceh Jaya',
  'Kab. Aceh Selatan',
  'Kab. Aceh Singkil',
  'Kab. Aceh Tamiang',
  'Kab. Aceh Tengah',
  'Kab. Aceh Tenggara',
  'Kab. Aceh Timur',
  'Kab. Aceh Utara',
  'Kab. Bener Meriah',
  'Kab. Bireuen',
  'Kab. Gayo Lues',
  'Kab. Nagan Raya',
  'Kab. Pidie',
  'Kab. Pidie Jaya',
  'Kab. Simeulue',
  'Kota Banda Aceh',
  'Kota Langsa',
  'Kota Lhokseumawe',
  'Kota Sabang',
  'Kota Subulussalam',
];

/**
 * Sinkronisasi Direktori Resmi Perguruan Tinggi Aceh dari Endpoint Lokasi Nasional PDDikti (/api/pt/locations)
 */
export async function syncAcehInstitutionsFromLocations(): Promise<SyncResult> {
  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return {
      success: false,
      runId: '',
      processedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      message: 'Kredensial SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server.',
      errors: ['SUPABASE_SERVICE_ROLE_KEY missing'],
    };
  }

  // Catat permulaan run
  let runId = '';
  const { data: runRecord, error: runErr } = await adminClient
    .from('sync_runs')
    .insert({
      status: 'running',
      target_type: 'pt_directory_locations',
      target_keyword: 'Aceh (23 Kab/Kota Official Locations)',
      processed_count: 0,
      inserted_count: 0,
      updated_count: 0,
    })
    .select('id')
    .single();

  if (runErr || !runRecord) {
    console.warn('[SYNC WARNING] Gagal membuat log sync_runs:', runErr?.message);
    runId = 'local-' + Date.now();
  } else {
    runId = runRecord.id;
  }

  const errors: string[] = [];
  let processedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  try {
    console.log('[SYNC PT] Mengambil data lokasi perguruan tinggi nasional dari PDDikti...');
    const res = await fetch(`${BASE_URL}/api/pt/locations`, { headers: HEADERS });
    if (!res.ok) {
      throw new Error(`HTTP Error dari PDDikti /api/pt/locations: ${res.status}`);
    }

    const json = await res.json();
    const allPts: Array<{
      kode: string;
      nama: string;
      kab_kota?: string;
      kelompok?: string;
      pembina?: string;
      lintang?: string;
      bujur?: string;
      id_sp?: string;
    }> = json.data || [];

    console.log(`[SYNC PT] Total data PT nasional yang diterima: ${allPts.length}`);

    // Dapatkan data kampus yang sudah ada di database saat ini untuk perbandingan
    const { data: existingList } = await adminClient
      .from('institutions')
      .select('kode_pt, nama, nama_singkat, metadata');

    const existingMap = new Map<string, { kode_pt: string; nama: string; nama_singkat?: string | null; metadata?: Record<string, unknown> }>();
    (existingList || []).forEach(item => {
      existingMap.set(item.kode_pt.trim(), item);
    });

    const acehKabTokens = [
      'aceh', 'banda aceh', 'sabang', 'lhokseumawe', 'langsa', 'subulussalam',
      'bireuen', 'pidie', 'pidie jaya', 'simeulue', 'gayo lues', 'bener meriah',
      'nagan raya', 'kutacane', 'takengon', 'meulaboh', 'tapaktuan', 'singkil',
      'idi', 'lhoksukon', 'sigli', 'calang', 'sinabang', 'blangkejeren', 'blangpidie', 'karang baru'
    ];

    // Filter kampus yang berlokasi di Aceh
    const acehCampuses = allPts.filter(it => {
      const kab = (it.kab_kota || '').toLowerCase();
      const nama = (it.nama || '').toLowerCase();
      // Jangan masukkan Karo (Sumut) jika kab_kota tertulis Karo
      if (kab.includes('karo')) return false;

      const inKab = acehKabTokens.some(k => kab.includes(k));
      const hasNameAceh = nama.includes('aceh');
      return inKab || hasNameAceh;
    });

    processedCount = acehCampuses.length;
    console.log(`[SYNC PT] Total kampus diidentifikasi di wilayah Aceh: ${processedCount}`);

    for (const pt of acehCampuses) {
      const cleanKode = cleanString(pt.kode);
      const cleanNama = cleanString(pt.nama);
      if (!cleanKode || !cleanNama) {
        skippedCount++;
        continue;
      }

      const existing = existingMap.get(cleanKode);
      const isNew = !existing;

      // Metadata terstruktur
      const newMetadata = {
        ...(existing?.metadata || {}),
        source: 'pddikti_pt_locations',
        verified_aceh: true,
        kab_kota: cleanString(pt.kab_kota) || null,
        kelompok: cleanString(pt.kelompok) || null,
        pembina: cleanString(pt.pembina) || null,
        lintang: pt.lintang ? parseFloat(pt.lintang) : null,
        bujur: pt.bujur ? parseFloat(pt.bujur) : null,
        last_synced_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await adminClient
        .from('institutions')
        .upsert(
          {
            kode_pt: cleanKode,
            nama: cleanNama,
            nama_singkat: existing?.nama_singkat || null,
            metadata: newMetadata,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'kode_pt' }
        );

      if (upsertErr) {
        errors.push(`PT ${cleanKode} (${cleanNama}): ${upsertErr.message}`);
      } else {
        if (isNew) {
          insertedCount++;
        } else {
          updatedCount++;
        }
      }
    }

    // Perbarui audit log
    if (runRecord) {
      await adminClient
        .from('sync_runs')
        .update({
          ended_at: new Date().toISOString(),
          status: errors.length > 0 && insertedCount === 0 && updatedCount === 0 ? 'failed' : 'success',
          processed_count: processedCount,
          inserted_count: insertedCount,
          updated_count: updatedCount,
          error_message: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
        })
        .eq('id', runRecord.id);
    }

    return {
      success: true,
      runId,
      processedCount,
      insertedCount,
      updatedCount,
      skippedCount,
      message: `Sinkronisasi direktori kampus selesai. Total diproses: ${processedCount}, Baru: ${insertedCount}, Diperbarui: ${updatedCount}, Terlewati: ${skippedCount}.`,
      errors,
    };
  } catch (fatalErr) {
    const msg = fatalErr instanceof Error ? fatalErr.message : String(fatalErr);
    if (runRecord) {
      await adminClient
        .from('sync_runs')
        .update({
          ended_at: new Date().toISOString(),
          status: 'failed',
          processed_count: processedCount,
          inserted_count: insertedCount,
          updated_count: updatedCount,
          error_message: msg,
        })
        .eq('id', runRecord.id);
    }
    return {
      success: false,
      runId,
      processedCount,
      insertedCount,
      updatedCount,
      skippedCount,
      message: `Sinkronisasi kampus gagal: ${msg}`,
      errors: [...errors, msg],
    };
  }
}

/**
 * Sinkronisasi Data Mahasiswa Bertarget dengan Guard Kontaminasi Antar-Kampus
 */
export async function runTargetedSync(options: SyncTargetOptions): Promise<SyncResult> {
  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return {
      success: false,
      runId: '',
      processedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      message: 'Kredensial SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server.',
      errors: ['SUPABASE_SERVICE_ROLE_KEY missing'],
    };
  }

  // Catat permulaan run pada tabel sync_runs
  const targetDesc = [
    options.targetCampusCode ? `KodePT:${options.targetCampusCode}` : '',
    options.campusKeyword ? `PT:${options.campusKeyword}` : '',
    options.studentKeyword ? `MHS:${options.studentKeyword}` : '',
  ].filter(Boolean).join(' | ') || 'Default Sync';

  let runId = '';
  const { data: runRecord, error: runErr } = await adminClient
    .from('sync_runs')
    .insert({
      status: 'running',
      target_type: options.studentKeyword ? 'mhs_targeted' : 'pt',
      target_keyword: targetDesc,
      processed_count: 0,
      inserted_count: 0,
      updated_count: 0,
    })
    .select('id')
    .single();

  if (runErr || !runRecord) {
    console.warn('[SYNC WARNING] Gagal membuat log sync_runs:', runErr?.message);
    runId = 'local-' + Date.now();
  } else {
    runId = runRecord.id;
  }

  let processedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  try {
    // 1. Sinkronisasi Kampus Spesifik jika diminta
    if (options.campusKeyword && !options.studentKeyword) {
      console.log(`[SYNC] Mencari data kampus dengan keyword: "${options.campusKeyword}"...`);
      const ptRes = await fetch(`${BASE_URL}/api/pencarian/pt/${encodeURIComponent(options.campusKeyword)}`, {
        headers: HEADERS,
      });

      if (ptRes.ok) {
        const ptJson = await ptRes.json();
        const ptList: Array<{ id: string; kode: string; nama_singkat: string; nama: string }> = Array.isArray(ptJson)
          ? ptJson
          : (ptJson.data || []);

        for (const pt of ptList) {
          const cleanKode = cleanString(pt.kode);
          const cleanNama = cleanString(pt.nama);
          if (!cleanKode || !cleanNama) continue;

          processedCount++;
          const { error: upsertPtErr } = await adminClient
            .from('institutions')
            .upsert(
              {
                kode_pt: cleanKode,
                nama: cleanNama,
                nama_singkat: cleanString(pt.nama_singkat) || null,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'kode_pt' }
            );

          if (upsertPtErr) {
            errors.push(`PT ${cleanNama}: ${upsertPtErr.message}`);
          } else {
            updatedCount++;
          }
        }
      }
    }

    // 2. Sinkronisasi Data Mahasiswa dengan Guard Kontaminasi
    if (options.studentKeyword) {
      console.log(`[SYNC] Mencari data mahasiswa dengan keyword: "${options.studentKeyword}"...`);
      const mhsRes = await fetch(`${BASE_URL}/api/pencarian/mhs/${encodeURIComponent(options.studentKeyword)}`, {
        headers: HEADERS,
      });

      if (mhsRes.ok) {
        const mhsJson = await mhsRes.json();
        const mhsList: Array<{
          id: string;
          nama: string;
          nim: string;
          nama_pt: string;
          sinkatan_pt?: string;
          nama_prodi?: string;
        }> = Array.isArray(mhsJson) ? mhsJson : (mhsJson.data || []);

        const limitToProcess = Math.min(mhsList.length, options.maxStudentsToProcess || 100);
        console.log(`[SYNC] Ditemukan ${mhsList.length} mahasiswa dari PDDikti. Memproses hingga ${limitToProcess} data.`);

        // Pre-fetch target campus jika ditentukan untuk validasi ketat
        let targetCampusRecord: { kode_pt: string; nama: string } | null = null;
        if (options.targetCampusCode) {
          const { data } = await adminClient
            .from('institutions')
            .select('kode_pt, nama')
            .eq('kode_pt', options.targetCampusCode.trim())
            .maybeSingle();
          targetCampusRecord = data;
        }

        for (let i = 0; i < limitToProcess; i++) {
          const item = mhsList[i];
          processedCount++;

          const rawNim = cleanString(item.nim);
          const rawNama = cleanString(item.nama);
          let rawNamaPt = cleanString(item.nama_pt);
          let rawProdi = cleanString(item.nama_prodi);

          // GUARD KONTAMINASI ANTAR-KAMPUS:
          // Jika pengguna menargetkan kampus tertentu (misal PNL), periksa apakah nama_pt mahasiswa ini cocok!
          if (options.campusKeyword) {
            const targetUpper = options.campusKeyword.toUpperCase().trim();
            const studentPtUpper = rawNamaPt.toUpperCase();
            if (!studentPtUpper.includes(targetUpper) && !targetUpper.includes(studentPtUpper)) {
              console.log(`[GUARD SKIP] Mahasiswa ${rawNama.slice(0, 2)}*** berasal dari "${rawNamaPt}", bukan kampus target "${options.campusKeyword}". Dilewati.`);
              skippedCount++;
              continue;
            }
          }

          let kodePt = '';
          let kodeProdi: string | null = null;
          let jenjang: string | null = null;
          let status: string | null = null;
          let tanggalMasuk: string | null = null;
          let tahunMasuk: number | null = null;
          let jenisKelamin: string | null = null;
          let rawDetailObj: Record<string, unknown> = {};

          // Ambil detail jika fetchDetails aktif (memberikan kode_pt, jenjang, status, tanggal_masuk resmi)
          if (options.fetchDetails !== false && item.id) {
            await sleep(600); // Polite rate-limiting
            try {
              const detailRes = await fetch(`${BASE_URL}/api/detail/mhs`, {
                method: 'POST',
                headers: {
                  ...HEADERS,
                  'Content-Type': 'application/json',
                  'Referer': `${BASE_URL}/detail-mhs/${item.id}`,
                  'Origin': BASE_URL,
                },
                body: JSON.stringify({ id: item.id }),
              });

              if (detailRes.ok) {
                const detailJson = await detailRes.json();
                const detail = detailJson.data || detailJson;
                if (detail && typeof detail === 'object') {
                  rawDetailObj = detail;
                  kodePt = cleanString(detail.kode_pt);
                  rawNamaPt = cleanString(detail.nama_pt) || rawNamaPt;
                  kodeProdi = cleanString(detail.kode_prodi) || null;
                  rawProdi = cleanString(detail.prodi) || rawProdi;
                  jenjang = cleanString(detail.jenjang) || null;
                  status = cleanStatus(detail.status_saat_ini);
                  tanggalMasuk = cleanString(detail.tanggal_masuk) || null;
                  tahunMasuk = extractYear(tanggalMasuk);
                  jenisKelamin = cleanString(detail.jenis_kelamin) || null;
                }
              } else {
                errors.push(`Detail HTTP ${detailRes.status} for item ${i + 1}`);
              }
            } catch (detailErr) {
              errors.push(`Detail fetch failed for item ${i + 1}: ${detailErr instanceof Error ? detailErr.message : String(detailErr)}`);
            }
          }

          // Verifikasi ulang targetCampusCode dengan detail kodePt jika ada
          if (targetCampusRecord && kodePt && kodePt !== targetCampusRecord.kode_pt) {
            console.log(`[GUARD SKIP] Kode PT mahasiswa (${kodePt}) berbeda dengan target (${targetCampusRecord.kode_pt}). Dilewati.`);
            skippedCount++;
            continue;
          }

          // Fallback kode_pt jika tidak ada detail: cari di institutions berdasarkan nama_pt
          if (!kodePt && rawNamaPt) {
            const { data: foundPt } = await adminClient
              .from('institutions')
              .select('kode_pt')
              .ilike('nama', rawNamaPt)
              .limit(1)
              .maybeSingle();

            if (foundPt) {
              kodePt = foundPt.kode_pt;
            } else {
              // Jika kampus belum ada di DB, tambahkan record institusi baru
              const tempKode = 'PT-' + rawNamaPt.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase();
              kodePt = tempKode;
              await adminClient
                .from('institutions')
                .upsert({ kode_pt: tempKode, nama: rawNamaPt }, { onConflict: 'kode_pt' });
            }
          }

          if (!kodePt || !rawNim || !rawNama) {
            skippedCount++;
            continue;
          }

          // Pastikan institusi terdaftar sebelum insert foreign key
          await adminClient
            .from('institutions')
            .upsert({ kode_pt: kodePt, nama: rawNamaPt }, { onConflict: 'kode_pt' });

          // Cek apakah data sudah ada sebelumnya di DB
          const { data: existing } = await adminClient
            .from('students')
            .select('id')
            .eq('kode_pt', kodePt)
            .eq('nim', rawNim)
            .maybeSingle();

          const { error: studentUpsertErr } = await adminClient
            .from('students')
            .upsert(
              {
                kode_pt: kodePt,
                nama_pt: rawNamaPt,
                nim: rawNim,
                nama: rawNama,
                kode_prodi: kodeProdi,
                prodi: rawProdi,
                jenjang,
                status: status || 'Aktif',
                tanggal_masuk: tanggalMasuk,
                tahun_masuk: tahunMasuk,
                jenis_kelamin: jenisKelamin,
                raw_detail: rawDetailObj,
                synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'kode_pt,nim' }
            );

          if (studentUpsertErr) {
            errors.push(`Student upsert err (${rawNim}): ${studentUpsertErr.message}`);
          } else {
            if (existing) {
              updatedCount++;
            } else {
              insertedCount++;
            }
          }
        }
      } else {
        errors.push(`MHS search HTTP error: ${mhsRes.status}`);
      }
    }

    // Perbarui audit log di sync_runs
    if (runRecord) {
      await adminClient
        .from('sync_runs')
        .update({
          ended_at: new Date().toISOString(),
          status: errors.length > 0 && processedCount === 0 ? 'failed' : (errors.length > 0 ? 'partial' : 'success'),
          processed_count: processedCount,
          inserted_count: insertedCount,
          updated_count: updatedCount,
          error_message: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
        })
        .eq('id', runRecord.id);
    }

    return {
      success: true,
      runId,
      processedCount,
      insertedCount,
      updatedCount,
      skippedCount,
      message: `Sinkronisasi selesai. Diproses: ${processedCount}, Baru: ${insertedCount}, Diperbarui: ${updatedCount}, Dilewati (Guard/Duplikat): ${skippedCount}.`,
      errors,
    };
  } catch (fatalErr) {
    const msg = fatalErr instanceof Error ? fatalErr.message : String(fatalErr);
    if (runRecord) {
      await adminClient
        .from('sync_runs')
        .update({
          ended_at: new Date().toISOString(),
          status: 'failed',
          processed_count: processedCount,
          inserted_count: insertedCount,
          updated_count: updatedCount,
          error_message: msg,
        })
        .eq('id', runRecord.id);
    }

    return {
      success: false,
      runId,
      processedCount,
      insertedCount,
      updatedCount,
      skippedCount,
      message: `Sinkronisasi terhenti karena kesalahan fatal: ${msg}`,
      errors: [...errors, msg],
    };
  }
}

export interface MultiProdiSyncOptions {
  campusKeyword: string;
  targetCampusCode?: string;
  prodiLimit?: number;
  maxStudentsPerProdi?: number;
  fetchDetails?: boolean;
}

/**
 * Sinkronisasi Mahasiswa Berbasis Partisi Program Studi
 * Memperoleh data mahasiswa dari seluruh program studi kampus terkait untuk menembus batas 100 record PDDikti.
 */
export async function syncCampusMultiProdi(options: MultiProdiSyncOptions): Promise<SyncResult> {
  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return {
      success: false,
      runId: '',
      processedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      message: 'Kredensial SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.',
      errors: ['SUPABASE_SERVICE_ROLE_KEY missing'],
    };
  }

  const { data: runRecord } = await adminClient
    .from('sync_runs')
    .insert({
      status: 'running',
      target_type: 'mhs_multi_prodi_sync',
      target_keyword: `MultiProdi:${options.campusKeyword}`,
      processed_count: 0,
      inserted_count: 0,
      updated_count: 0,
    })
    .select('id')
    .single();

  const runId = runRecord?.id || 'local-' + Date.now();
  let processedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  try {
    // 1. Resolve PT
    const { data: ptData } = await adminClient
      .from('institutions')
      .select('kode_pt, nama, nama_singkat')
      .ilike('nama', `%${options.campusKeyword}%`)
      .limit(1)
      .maybeSingle();

    const targetKodePt = ptData?.kode_pt || options.targetCampusCode || '005016';
    const targetNamaPt = ptData?.nama || options.campusKeyword;

    // 2. Fetch prodi list
    const prodiRes = await fetch(`${BASE_URL}/api/pencarian/prodi/${encodeURIComponent(targetNamaPt)}`, { headers: HEADERS });
    if (!prodiRes.ok) {
      throw new Error(`HTTP ${prodiRes.status} saat mengambil daftar prodi`);
    }

    const prodiJson = await prodiRes.json();
    const rawProdis = prodiJson.data || [];
    const targetUpper = targetNamaPt.toUpperCase();

    const campusProdis: Array<{ nama: string; jenjang?: string; pt?: string }> = rawProdis.filter((p: { nama?: string; pt?: string }) => {
      const pPt = (p.pt || '').toUpperCase();
      return pPt.includes(targetUpper) || targetUpper.includes(pPt);
    });

    const prodisToProcess = options.prodiLimit && options.prodiLimit > 0
      ? campusProdis.slice(0, options.prodiLimit)
      : campusProdis;

    const maxPerProdi = options.maxStudentsPerProdi || 100;

    for (let pIdx = 0; pIdx < prodisToProcess.length; pIdx++) {
      const prodi = prodisToProcess[pIdx];
      const prodiNama = cleanString(prodi.nama);
      const prodiJenjang = cleanString(prodi.jenjang) || null;

      await sleep(500);

      const mhsRes = await fetch(`${BASE_URL}/api/pencarian/mhs/${encodeURIComponent(prodiNama + ' ' + targetNamaPt)}`, {
        headers: HEADERS,
      });

      if (!mhsRes.ok) {
        errors.push(`Prodi ${prodiNama}: HTTP ${mhsRes.status}`);
        continue;
      }

      const mhsJson = await mhsRes.json();
      const rawList = mhsJson.data || [];
      const studentsToInsert: Array<Record<string, unknown>> = [];

      for (let i = 0; i < Math.min(rawList.length, maxPerProdi); i++) {
        const item = rawList[i];
        processedCount++;

        const nim = cleanString(item.nim);
        const nama = cleanString(item.nama);
        const studentPt = cleanString(item.nama_pt);

        if (!nim || !nama) continue;

        // Guard Kontaminasi
        const studentPtUpper = studentPt.toUpperCase();
        if (!studentPtUpper.includes(targetUpper) && !targetUpper.includes(studentPtUpper)) {
          skippedCount++;
          continue;
        }

        let studentKodeProdi: string | null = null;
        let studentJenjang = prodiJenjang;
        let status = 'Aktif';
        let tanggalMasuk: string | null = null;
        let tahunMasuk = extractYear(null);
        let jenisKelamin: string | null = null;
        let rawDetailObj: Record<string, unknown> = {};

        if (options.fetchDetails && item.id) {
          await sleep(600);
          try {
            const detailRes = await fetch(`${BASE_URL}/api/detail/mhs`, {
              method: 'POST',
              headers: {
                ...HEADERS,
                'Content-Type': 'application/json',
                'Referer': `${BASE_URL}/detail-mhs/${item.id}`,
              },
              body: JSON.stringify({ id: item.id }),
            });

            if (detailRes.ok) {
              const detailJson = await detailRes.json();
              const d = detailJson.data || detailJson;
              if (d && typeof d === 'object') {
                rawDetailObj = d;
                studentKodeProdi = cleanString(d.kode_prodi) || null;
                studentJenjang = cleanString(d.jenjang) || studentJenjang;
                status = cleanStatus(d.status_saat_ini);
                tanggalMasuk = cleanString(d.tanggal_masuk) || null;
                tahunMasuk = extractYear(tanggalMasuk);
                jenisKelamin = cleanString(d.jenis_kelamin) || null;
              }
            }
          } catch {
            // detail fallback
          }
        }

        if (!tahunMasuk) {
          // Infer from NIM
          if (/^(19\d{2}|20\d{2})/.test(nim)) {
            tahunMasuk = parseInt(nim.slice(0, 4), 10);
          } else if (/^\d{2}/.test(nim)) {
            const prefix = parseInt(nim.slice(0, 2), 10);
            tahunMasuk = prefix >= 80 ? 1900 + prefix : 2000 + prefix;
          }
        }

        studentsToInsert.push({
          kode_pt: targetKodePt,
          nama_pt: targetNamaPt,
          nim,
          nama,
          kode_prodi: studentKodeProdi,
          prodi: cleanString(item.nama_prodi) || prodiNama,
          jenjang: studentJenjang,
          status,
          tanggal_masuk: tanggalMasuk,
          tahun_masuk: tahunMasuk,
          jenis_kelamin: jenisKelamin,
          raw_detail: rawDetailObj,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      if (studentsToInsert.length > 0) {
        const { error: upsertErr } = await adminClient
          .from('students')
          .upsert(studentsToInsert, { onConflict: 'kode_pt,nim' });

        if (upsertErr) {
          errors.push(`Upsert error for ${prodiNama}: ${upsertErr.message}`);
        } else {
          insertedCount += studentsToInsert.length;
        }
      }
    }

    if (runRecord) {
      await adminClient
        .from('sync_runs')
        .update({
          ended_at: new Date().toISOString(),
          status: errors.length > 0 && insertedCount === 0 ? 'failed' : 'success',
          processed_count: processedCount,
          inserted_count: insertedCount,
          updated_count: updatedCount,
          error_message: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
        })
        .eq('id', runRecord.id);
    }

    return {
      success: true,
      runId,
      processedCount,
      insertedCount,
      updatedCount,
      skippedCount,
      message: `Multi-prodi sync selesai. Total prodi diproses: ${prodisToProcess.length}, Mahasiswa tersimpan: ${insertedCount}.`,
      errors,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (runRecord) {
      await adminClient
        .from('sync_runs')
        .update({
          ended_at: new Date().toISOString(),
          status: 'failed',
          processed_count: processedCount,
          inserted_count: insertedCount,
          updated_count: updatedCount,
          error_message: msg,
        })
        .eq('id', runRecord.id);
    }
    return {
      success: false,
      runId,
      processedCount,
      insertedCount,
      updatedCount,
      skippedCount,
      message: `Multi-prodi sync gagal: ${msg}`,
      errors: [...errors, msg],
    };
  }
}
