/**
 * Manual Server-side Sync Runner for Direktori Mahasiswa Aceh.
 *
 * Penggunaan:
 *   node scripts/sync-runner.mjs --sync-campuses
 *   node scripts/sync-runner.mjs --campus="Politeknik Negeri Lhokseumawe" --all-prodi [--prodi-limit=5] [--max-per-prodi=100]
 *   node scripts/sync-runner.mjs --campus="Politeknik Negeri Lhokseumawe" --mhs="Politeknik Negeri Lhokseumawe" --max=10
 *
 * Fitur:
 * - Sinkronisasi direktori PT Aceh terverifikasi dari /api/pt/locations PDDikti
 * - Strategi multi-prodi terpartisi untuk menembus batas hard-cap 100 PDDikti secara terukur
 * - Guard Kontaminasi Antar-Kampus ketat (tidak memasukkan mahasiswa kampus lain)
 * - Checkpoint, Retry eksponensial (max 3), Rate Limiting, Deduplikasi (kode_pt, nim)
 * - Batch Upsert ke Supabase PostgreSQL (?on_conflict=kode_pt,nim)
 * - Pencatatan komprehensif ke tabel sync_runs
 * - Tidak mengekspos PII atau secret ke log konsol
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env.local jika ada
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envLocalPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || SUPABASE_URL.includes('your-project-id') || SERVICE_KEY.includes('your-')) {
  console.error('\n[FATAL] Konfigurasi Supabase belum lengkap di .env.local.');
  console.error('Pastikan NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY sudah terisi dengan benar.');
  process.exit(1);
}

const args = process.argv.slice(2);
let campusArg = null;
let mhsArg = null;
let maxArg = 10;
let syncCampusesFlag = false;
let allProdiFlag = false;
let prodiLimitArg = 0; // 0 = no limit (all prodis)
let maxPerProdiArg = 100;
let fetchDetailsFlag = false;
let checkpointFileArg = path.resolve(__dirname, '../.sync-prodi-checkpoint.json');

for (const arg of args) {
  if (arg.startsWith('--campus=')) campusArg = arg.split('=')[1].replace(/^['"]|['"]$/g, '');
  if (arg.startsWith('--mhs=')) mhsArg = arg.split('=')[1].replace(/^['"]|['"]$/g, '');
  if (arg.startsWith('--max=')) maxArg = parseInt(arg.split('=')[1], 10) || 10;
  if (arg === '--all-prodi' || arg === '--prodi') allProdiFlag = true;
  if (arg.startsWith('--prodi-limit=')) prodiLimitArg = parseInt(arg.split('=')[1], 10) || 0;
  if (arg.startsWith('--max-per-prodi=')) maxPerProdiArg = parseInt(arg.split('=')[1], 10) || 100;
  if (arg === '--fetch-details') fetchDetailsFlag = true;
  if (arg.startsWith('--checkpoint=')) checkpointFileArg = path.resolve(arg.split('=')[1].replace(/^['"]|['"]$/g, ''));
  if (arg === '--sync-campuses' || arg === '--pt-list') syncCampusesFlag = true;
}

if (!campusArg && !mhsArg && !syncCampusesFlag) {
  console.log('\n--- SINKRONISASI SERVER-SIDE DIREKTORI MAHASISWA ACEH ---');
  console.log('Argumen yang didukung:');
  console.log('  --sync-campuses                                     (Sinkronisasi seluruh PT Aceh dari /api/pt/locations)');
  console.log('  --campus="Nama Kampus" --all-prodi [--prodi-limit=N] (Sinkronisasi per program studi untuk menembus cap 100)');
  console.log('  --campus="Nama Kampus" --mhs="Keyword" [--max=N]     (Sinkronisasi data Mahasiswa bertarget)');
  console.log('  --fetch-details                                     (Mengambil detail tanggal/status lengkap)');
  console.log('\nContoh:');
  console.log('  node scripts/sync-runner.mjs --sync-campuses');
  console.log('  node scripts/sync-runner.mjs --campus="Politeknik Negeri Lhokseumawe" --all-prodi --prodi-limit=5\n');
  process.exit(0);
}

const BASE_URL = 'https://pddikti.kemdiktisaintek.go.id';
const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': `${BASE_URL}/`,
  'Origin': BASE_URL,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || (res.status >= 500 && res.status <= 504)) {
        attempt++;
        const backoff = Math.pow(2, attempt) * 1000;
        console.warn(`  [RETRY ${attempt}/${maxRetries}] HTTP ${res.status}. Menunggu ${backoff}ms...`);
        await sleep(backoff);
        continue;
      }
      return res;
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) throw err;
      const backoff = Math.pow(2, attempt) * 1000;
      console.warn(`  [RETRY ${attempt}/${maxRetries}] Network error: ${err.message}. Menunggu ${backoff}ms...`);
      await sleep(backoff);
    }
  }
  return await fetch(url, options);
}

async function supabaseRequest(pathEndpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${pathEndpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation,resolution=merge-duplicates',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error [${res.status}]: ${text}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await res.json();
  }
  return null;
}

function cleanStatus(status) {
  if (!status) return 'Aktif';
  let s = status.trim();
  while (s.endsWith('-') || s.endsWith(' ')) {
    s = s.slice(0, -1).trim();
  }
  return s || 'Aktif';
}

function inferTahunMasuk(nim, rawTanggalMasuk) {
  if (rawTanggalMasuk && /^\d{4}/.test(rawTanggalMasuk)) {
    return parseInt(rawTanggalMasuk.slice(0, 4), 10);
  }
  if (!nim) return null;
  const cleanNim = nim.trim();

  // Format 4 digit: 2022xxx, 2023xxx, 2019xxx, 1999xxx
  if (/^(19\d{2}|20\d{2})/.test(cleanNim)) {
    const y = parseInt(cleanNim.slice(0, 4), 10);
    if (y >= 1980 && y <= 2030) return y;
  }

  // Format 2 digit: 14xxx -> 2014, 09xxx -> 2009, 21xxx -> 2021
  if (/^\d{2}/.test(cleanNim)) {
    const prefix = parseInt(cleanNim.slice(0, 2), 10);
    if (prefix >= 80 && prefix <= 99) return 1900 + prefix;
    if (prefix >= 0 && prefix <= 30) return 2000 + prefix;
  }

  return null;
}

async function run() {
  console.log('========================================================');
  console.log('SINKRONISASI SERVER-SIDE DIREKTORI MAHASISWA ACEH');
  console.log('Target Database:', SUPABASE_URL);
  console.log('Waktu mulai:', new Date().toISOString());
  console.log('========================================================');

  // 1. SINKRONISASI DIREKTORI KAMPUS DARI /api/pt/locations
  if (syncCampusesFlag) {
    console.log('\n--- SINKRONISASI DIREKTORI PERGURUAN TINGGI RESMI ACEH ---');
    console.log('Mengambil data nasional dari PDDikti /api/pt/locations...');
    const locRes = await fetchWithRetry(`${BASE_URL}/api/pt/locations`, { headers: HEADERS });
    if (!locRes.ok) {
      console.error(`Gagal mengambil data /api/pt/locations: HTTP ${locRes.status}`);
      return;
    }

    const locJson = await locRes.json();
    const allPts = locJson.data || [];
    console.log(`Berhasil mengambil ${allPts.length} data perguruan tinggi nasional.`);

    const acehKabTokens = [
      'aceh', 'banda aceh', 'sabang', 'lhokseumawe', 'langsa', 'subulussalam',
      'bireuen', 'pidie', 'pidie jaya', 'simeulue', 'gayo lues', 'bener meriah',
      'nagan raya', 'kutacane', 'takengon', 'meulaboh', 'tapaktuan', 'singkil',
      'idi', 'lhoksukon', 'sigli', 'calang', 'sinabang', 'blangkejeren', 'blangpidie', 'karang baru'
    ];

    const acehCampuses = allPts.filter(it => {
      const kab = (it.kab_kota || '').toLowerCase();
      const nama = (it.nama || '').toLowerCase();
      if (kab.includes('karo')) return false;
      return acehKabTokens.some(k => kab.includes(k)) || nama.includes('aceh');
    });

    console.log(`Ditemukan ${acehCampuses.length} perguruan tinggi terverifikasi di Provinsi Aceh.`);

    const existingInsts = await supabaseRequest('institutions?select=kode_pt,nama,nama_singkat,metadata');
    const existingMap = new Map();
    (existingInsts || []).forEach(i => existingMap.set(i.kode_pt.trim(), i));

    let newCount = 0;
    let updatedCount = 0;
    let errCount = 0;

    for (const pt of acehCampuses) {
      const kode = (pt.kode || '').trim();
      const nama = (pt.nama || '').trim();
      if (!kode || !nama) continue;

      const existing = existingMap.get(kode);
      const isNew = !existing;

      const meta = {
        ...(existing?.metadata || {}),
        source: 'pddikti_pt_locations',
        verified_aceh: true,
        kab_kota: (pt.kab_kota || '').trim() || null,
        kelompok: (pt.kelompok || '').trim() || null,
        pembina: (pt.pembina || '').trim() || null,
        lintang: pt.lintang ? parseFloat(pt.lintang) : null,
        bujur: pt.bujur ? parseFloat(pt.bujur) : null,
        last_synced_at: new Date().toISOString(),
      };

      try {
        await supabaseRequest('institutions', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify([{
            kode_pt: kode,
            nama,
            nama_singkat: existing?.nama_singkat || null,
            metadata: meta,
            updated_at: new Date().toISOString(),
          }]),
        });

        if (isNew) {
          newCount++;
          console.log(`  [BARU] [${kode}] ${nama} (${pt.kab_kota || '-'})`);
        } else {
          updatedCount++;
        }
      } catch (err) {
        errCount++;
        console.error(`  [ERROR] [${kode}] ${nama}: ${err.message}`);
      }
    }

    await supabaseRequest('sync_runs', {
      method: 'POST',
      body: JSON.stringify([{
        target_type: 'pt_directory_locations',
        target_keyword: 'Aceh (23 Kab/Kota Official Locations)',
        processed_count: acehCampuses.length,
        inserted_count: newCount,
        updated_count: updatedCount,
        status: errCount === 0 ? 'success' : 'partial',
        error_message: errCount > 0 ? `${errCount} kampus gagal disimpan` : null,
        ended_at: new Date().toISOString(),
      }]),
    });

    console.log('\n--- HASIL SINKRONISASI KAMPUS ---');
    console.log(`Total PT Aceh ditemukan dari PDDikti : ${acehCampuses.length}`);
    console.log(`Kampus Baru Ditambahkan              : ${newCount}`);
    console.log(`Kampus Sudah Ada (Metadata Diperbarui): ${updatedCount}`);
    console.log(`Error                                : ${errCount}`);
    console.log(`Total record PT di database sekarang : ${existingMap.size + newCount}`);
  }

  // 2. SINKRONISASI MAHASISWA MULTI-PRODI (MENEMBUS BATAS 100 RECORD)
  if (campusArg && allProdiFlag) {
    console.log(`\n--- SINKRONISASI MAHASISWA MULTI-PRODI ---`);
    console.log(`Target Kampus: "${campusArg}"`);
    console.log(`Mode: Partisi per Program Studi (Bypass limit 100 search cap PDDikti)`);

    // Dapatkan data institusi resmi dari DB
    const foundInsts = await supabaseRequest(`institutions?nama=ilike.*${encodeURIComponent(campusArg)}*&select=kode_pt,nama,nama_singkat&limit=5`);
    let targetInst = (foundInsts && foundInsts.length > 0) ? foundInsts[0] : null;
    if (!targetInst) {
      console.warn(`Kampus "${campusArg}" belum terdaftar di database. Menggunakan kode sementara.`);
      targetInst = {
        kode_pt: '005016',
        nama: campusArg,
      };
    }

    const kodePt = targetInst.kode_pt.trim();
    const namaPt = targetInst.nama.trim();
    console.log(`Kampus Teridentifikasi: [${kodePt}] ${namaPt}`);

    // Ambil daftar prodi dari endpoint resmi /api/pencarian/prodi/{campusArg}
    console.log(`Mengambil daftar program studi dari PDDikti /api/pencarian/prodi/...`);
    const prodiRes = await fetchWithRetry(`${BASE_URL}/api/pencarian/prodi/${encodeURIComponent(namaPt)}`, { headers: HEADERS });
    if (!prodiRes.ok) {
      console.error(`Gagal mengambil prodi: HTTP ${prodiRes.status}`);
      return;
    }

    const prodiJson = await prodiRes.json();
    const rawProdiList = prodiJson.data || [];

    // Filter prodi yang benar-benar milik kampus target
    const targetUpper = namaPt.toUpperCase();
    const campusProdis = rawProdiList.filter(p => {
      const ptName = (p.pt || '').toUpperCase();
      const ptSingkat = (p.pt_singkat || '').toUpperCase();
      return ptName.includes(targetUpper) || targetUpper.includes(ptName) || (targetInst.nama_singkat && ptSingkat.includes(targetInst.nama_singkat.toUpperCase()));
    });

    console.log(`Ditemukan ${campusProdis.length} program studi resmi untuk ${namaPt}.`);
    if (campusProdis.length === 0) {
      console.error('Tidak ada prodi yang cocok dengan kampus target.');
      return;
    }

    // Baca checkpoint jika ada
    let completedProdis = new Set();
    if (fs.existsSync(checkpointFileArg)) {
      try {
        const cp = JSON.parse(fs.readFileSync(checkpointFileArg, 'utf8'));
        if (cp.kode_pt === kodePt && Array.isArray(cp.completed)) {
          completedProdis = new Set(cp.completed);
          console.log(`Memuat checkpoint: ${completedProdis.size} prodi sudah pernah disinkronkan sebelumnya.`);
        }
      } catch (e) {
        console.warn('Gagal membaca file checkpoint:', e.message);
      }
    }

    const prodisToProcess = prodiLimitArg > 0
      ? campusProdis.filter(p => !completedProdis.has(p.nama)).slice(0, prodiLimitArg)
      : campusProdis.filter(p => !completedProdis.has(p.nama));

    console.log(`Prodi yang akan diproses pada sesi ini: ${prodisToProcess.length} prodi.`);

    let totalDiscovered = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkippedGuard = 0;
    let prodiProcessedCount = 0;

    const sessionStudentsMap = new Map();

    for (let pIdx = 0; pIdx < prodisToProcess.length; pIdx++) {
      const prodi = prodisToProcess[pIdx];
      const prodiNama = prodi.nama.trim();
      const prodiJenjang = (prodi.jenjang || '').trim();
      console.log(`\n[PRODI ${pIdx + 1}/${prodisToProcess.length}] ${prodiJenjang} ${prodiNama}...`);

      const searchQuery = `${prodiNama} ${namaPt}`;
      await sleep(500); // Polite rate limit

      let mhsRes;
      try {
        mhsRes = await fetchWithRetry(`${BASE_URL}/api/pencarian/mhs/${encodeURIComponent(searchQuery)}`, { headers: HEADERS });
      } catch (err) {
        console.error(`  Gagal mencari mahasiswa prodi ${prodiNama}: ${err.message}`);
        continue;
      }

      if (!mhsRes.ok) {
        console.warn(`  HTTP ${mhsRes.status} saat mencari prodi ${prodiNama}`);
        continue;
      }

      const mhsJson = await mhsRes.json();
      const rawList = mhsJson.data || [];
      console.log(`  PDDikti mengembalikan ${rawList.length} mahasiswa.`);

      const validStudentsToUpsert = [];

      for (let i = 0; i < Math.min(rawList.length, maxPerProdiArg); i++) {
        const item = rawList[i];
        totalDiscovered++;
        const nim = (item.nim || '').trim();
        const nama = (item.nama || '').trim();
        const studentPt = (item.nama_pt || '').trim();
        const studentProdi = (item.nama_prodi || prodiNama).trim();

        if (!nim || !nama) continue;

        // GUARD KONTAMINASI ANTAR-KAMPUS:
        const studentPtUpper = studentPt.toUpperCase();
        if (!studentPtUpper.includes(targetUpper) && !targetUpper.includes(studentPtUpper)) {
          totalSkippedGuard++;
          continue;
        }

        // Deduplikasi dalam sesi berjalan
        const dedupeKey = `${kodePt}:${nim}`;
        if (sessionStudentsMap.has(dedupeKey)) {
          continue;
        }
        sessionStudentsMap.set(dedupeKey, true);

        let studentKodeProdi = null;
        let studentJenjang = prodiJenjang || null;
        let status = 'Aktif';
        let tanggalMasuk = null;
        let tahunMasuk = inferTahunMasuk(nim, null);
        let jenisKelamin = null;
        let rawDetailObj = {};

        // Ambil detail jika diminta
        if (fetchDetailsFlag && item.id) {
          await sleep(600);
          try {
            const detailRes = await fetchWithRetry(`${BASE_URL}/api/detail/mhs`, {
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
                studentKodeProdi = (d.kode_prodi || '').trim() || null;
                studentJenjang = (d.jenjang || '').trim() || studentJenjang;
                status = cleanStatus(d.status_saat_ini);
                tanggalMasuk = (d.tanggal_masuk || '').trim() || null;
                tahunMasuk = inferTahunMasuk(nim, tanggalMasuk);
                jenisKelamin = (d.jenis_kelamin || '').trim() || null;
              }
            }
          } catch (e) {
            // Abaikan error detail agar proses tetap jalan
          }
        }

        validStudentsToUpsert.push({
          kode_pt: kodePt,
          nama_pt: namaPt,
          nim,
          nama,
          kode_prodi: studentKodeProdi,
          prodi: studentProdi,
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

      // Batch Upsert ke Supabase (?on_conflict=kode_pt,nim)
      if (validStudentsToUpsert.length > 0) {
        try {
          const upsertRes = await supabaseRequest('students?on_conflict=kode_pt,nim', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(validStudentsToUpsert),
          });
          totalInserted += validStudentsToUpsert.length;
          console.log(`  -> Berhasil menyimpan ${validStudentsToUpsert.length} mahasiswa dari prodi ${prodiNama}.`);
        } catch (dbErr) {
          console.error(`  -> Gagal menyimpan batch prodi ${prodiNama}: ${dbErr.message}`);
        }
      } else {
        console.log(`  -> Tidak ada mahasiswa baru/valid dari prodi ini.`);
      }

      // Simpan Checkpoint
      completedProdis.add(prodiNama);
      prodiProcessedCount++;
      fs.writeFileSync(
        checkpointFileArg,
        JSON.stringify({
          kode_pt: kodePt,
          nama_pt: namaPt,
          updated_at: new Date().toISOString(),
          completed: Array.from(completedProdis),
        }, null, 2)
      );
    }

    // Catat ke sync_runs
    await supabaseRequest('sync_runs', {
      method: 'POST',
      body: JSON.stringify([{
        target_type: 'mhs_multi_prodi_sync',
        target_keyword: `${namaPt} (${prodiProcessedCount} Prodi Terpartisi)`,
        processed_count: totalDiscovered,
        inserted_count: totalInserted,
        updated_count: totalUpdated,
        status: 'success',
        ended_at: new Date().toISOString(),
      }]),
    });

    console.log('\n========================================================');
    console.log('HASIL SINKRONISASI MULTI-PRODI');
    console.log(`Total Prodi Diproses          : ${prodiProcessedCount}`);
    console.log(`Total Data Diterima           : ${totalDiscovered}`);
    console.log(`Total Mahasiswa Tersimpan     : ${totalInserted}`);
    console.log(`Dilewati Guard Kontaminasi    : ${totalSkippedGuard}`);
    console.log('========================================================');
  }

  // 3. SINKRONISASI MAHASISWA BERTARGET TUNGGAL DENGAN GUARD KONTAMINASI
  if (mhsArg && !allProdiFlag) {
    console.log(`\n--- SINKRONISASI MAHASISWA BERTARGET ---`);
    console.log(`Query pencarian: "${mhsArg}" (Batas proses: ${maxArg})`);
    if (campusArg) {
      console.log(`Target Kampus  : "${campusArg}" (Guard Kontaminasi Aktif)`);
    }

    const mhsRes = await fetchWithRetry(`${BASE_URL}/api/pencarian/mhs/${encodeURIComponent(mhsArg)}`, { headers: HEADERS });
    if (!mhsRes.ok) {
      console.error(`Gagal memanggil endpoint pencarian mahasiswa: HTTP ${mhsRes.status}`);
      return;
    }

    const mhsJson = await mhsRes.json();
    const list = Array.isArray(mhsJson) ? mhsJson : (mhsJson.data || []);
    console.log(`Hasil diterima dari PDDikti: ${list.length} data (Hard cap max: 100).`);

    const toProcess = list.slice(0, maxArg);
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < toProcess.length; i++) {
      const item = toProcess[i];
      const nim = (item.nim || '').trim();
      const nama = (item.nama || '').trim();
      let nama_pt = (item.nama_pt || '').trim();
      let prodi = (item.nama_prodi || '').trim() || null;

      // GUARD KONTAMINASI ANTAR-KAMPUS:
      if (campusArg) {
        const targetUpper = campusArg.toUpperCase().trim();
        const studentPtUpper = nama_pt.toUpperCase().trim();
        if (!studentPtUpper.includes(targetUpper) && !targetUpper.includes(studentPtUpper)) {
          console.log(`  [GUARD SKIP] Mahasiswa ${nama.slice(0, 2)}*** terdaftar di "${nama_pt}", bukan target "${campusArg}". Dilewati.`);
          skipped++;
          continue;
        }
      }

      let kode_pt = '';
      let kode_prodi = null;
      let jenjang = null;
      let status = 'Aktif';
      let tanggal_masuk = null;
      let tahun_masuk = inferTahunMasuk(nim, null);
      let jenis_kelamin = null;
      let rawDetailObj = {};

      if (item.id && fetchDetailsFlag) {
        await sleep(650);
        try {
          const detailRes = await fetchWithRetry(`${BASE_URL}/api/detail/mhs`, {
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
              kode_pt = (d.kode_pt || '').trim();
              nama_pt = (d.nama_pt || '').trim() || nama_pt;
              kode_prodi = (d.kode_prodi || '').trim() || null;
              prodi = (d.prodi || '').trim() || prodi;
              jenjang = (d.jenjang || '').trim() || null;
              status = cleanStatus(d.status_saat_ini);
              tanggal_masuk = (d.tanggal_masuk || '').trim() || null;
              tahun_masuk = inferTahunMasuk(nim, tanggal_masuk);
              jenis_kelamin = (d.jenis_kelamin || '').trim() || null;
            }
          }
        } catch (e) {
          console.warn(`  [DETAIL ERROR] ${nama.slice(0, 2)}***: ${e.message}`);
        }
      }

      if (!kode_pt && nama_pt) {
        const found = await supabaseRequest(`institutions?nama=ilike.*${encodeURIComponent(nama_pt)}*&select=kode_pt&limit=1`);
        if (found && found.length > 0) {
          kode_pt = found[0].kode_pt;
        } else {
          kode_pt = 'PT-' + nama_pt.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase();
        }
      }

      if (!kode_pt || !nim || !nama) {
        skipped++;
        continue;
      }

      // Pastikan institusi terdaftar
      await supabaseRequest('institutions', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify([{ kode_pt, nama: nama_pt }]),
      });

      const existing = await supabaseRequest(`students?kode_pt=eq.${encodeURIComponent(kode_pt)}&nim=eq.${encodeURIComponent(nim)}&select=id&limit=1`);

      await supabaseRequest('students?on_conflict=kode_pt,nim', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify([{
          kode_pt,
          nama_pt,
          nim,
          nama,
          kode_prodi,
          prodi,
          jenjang,
          status,
          tanggal_masuk,
          tahun_masuk,
          jenis_kelamin,
          raw_detail: rawDetailObj,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }]),
      });

      if (existing && existing.length > 0) {
        updated++;
        console.log(`  [UPDATE] ${nama.slice(0, 2)}*** [NIM: ${nim.slice(0, 2)}***] (${nama_pt} - ${prodi || '-'})`);
      } else {
        inserted++;
        console.log(`  [INSERT] ${nama.slice(0, 2)}*** [NIM: ${nim.slice(0, 2)}***] (${nama_pt} - ${prodi || '-'})`);
      }
    }

    await supabaseRequest('sync_runs', {
      method: 'POST',
      body: JSON.stringify([{
        target_type: 'mhs_targeted',
        target_keyword: `${campusArg ? 'PT:' + campusArg + ' | ' : ''}MHS:${mhsArg}`,
        processed_count: toProcess.length,
        inserted_count: inserted,
        updated_count: updated,
        status: 'success',
        ended_at: new Date().toISOString(),
      }]),
    });

    console.log('\n--- HASIL SINKRONISASI MAHASISWA ---');
    console.log(`Total Diproses         : ${toProcess.length}`);
    console.log(`Data Mahasiswa Baru    : ${inserted}`);
    console.log(`Data Diperbarui        : ${updated}`);
    console.log(`Dilewati (Guard/Valid) : ${skipped}`);
  }

  console.log('\nSelesai.');
}

run().catch(console.error);
