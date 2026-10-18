/**
 * Master Server-side Sync Runner for Direktori Mahasiswa Aceh.
 * 
 * Penggunaan:
 *   # 1. Tampilkan estimasi cakupan dan jumlah request sebelum menjalankan (Aman, tanpa request masif)
 *   node scripts/sync-runner.mjs --all-aceh
 * 
 *   # 2. Eksekusi sinkronisasi seluruh kampus Aceh (dengan checkpointing & rate-limiting otomatis)
 *   node scripts/sync-runner.mjs --all-aceh --execute
 * 
 *   # 3. Eksekusi bertahap (contoh: 5 kampus pertama)
 *   node scripts/sync-runner.mjs --all-aceh --execute --campus-limit=5
 * 
 *   # 4. Sinkronisasi satu kampus spesifik (seluruh prodi)
 *   node scripts/sync-runner.mjs --campus="Politeknik Negeri Lhokseumawe" --all-prodi
 * 
 *   # 5. Sinkronisasi direktori 183 PT Aceh dari endpoint lokasi resmi PDDikti
 *   node scripts/sync-runner.mjs --sync-campuses
 * 
 * Fitur:
 * - Mengambil daftar kampus secara dinamis dari tabel `institutions` Supabase (tanpa hardcode)
 * - Menelusuri prodi via `/api/pencarian/prodi/{pt}` dan mahasiswa via `/api/pencarian/mhs/{prodi} {pt}`
 * - Checkpoint terperinci per kampus dan per prodi (.sync-aceh-checkpoint.json)
 * - Penanganan batas hard-cap 100 PDDikti (mencatat prodi capped & lanjut tanpa terhenti)
 * - Guard Kontaminasi Antar-Kampus ketat (tidak memasukkan mahasiswa kampus lain)
 * - Batch Upsert ke Supabase PostgreSQL (?on_conflict=kode_pt,nim)
 * - Rate limiting dan Retry eksponensial (max 3)
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
let allAcehFlag = false;
let executeFlag = false;
let campusArg = null;
let mhsArg = null;
let maxArg = 10;
let syncCampusesFlag = false;
let allProdiFlag = false;
let campusLimitArg = 0;
let prodiLimitArg = 0;
let maxPerProdiArg = 100;
let delayMsArg = 600;
let resetCheckpointFlag = false;
let checkpointFileArg = path.resolve(__dirname, '../.sync-aceh-checkpoint.json');

for (const arg of args) {
  if (arg === '--all-aceh' || arg === '--all') allAcehFlag = true;
  if (arg === '--execute' || arg === '-y') executeFlag = true;
  if (arg.startsWith('--campus=')) campusArg = arg.split('=')[1].replace(/^['"]|['"]$/g, '');
  if (arg.startsWith('--mhs=')) mhsArg = arg.split('=')[1].replace(/^['"]|['"]$/g, '');
  if (arg.startsWith('--max=')) maxArg = parseInt(arg.split('=')[1], 10) || 10;
  if (arg === '--all-prodi' || arg === '--prodi') allProdiFlag = true;
  if (arg.startsWith('--campus-limit=')) campusLimitArg = parseInt(arg.split('=')[1], 10) || 0;
  if (arg.startsWith('--prodi-limit=')) prodiLimitArg = parseInt(arg.split('=')[1], 10) || 0;
  if (arg.startsWith('--max-per-prodi=')) maxPerProdiArg = parseInt(arg.split('=')[1], 10) || 100;
  if (arg.startsWith('--delay=')) delayMsArg = parseInt(arg.split('=')[1], 10) || 600;
  if (arg === '--reset-checkpoint') resetCheckpointFlag = true;
  if (arg.startsWith('--checkpoint=')) checkpointFileArg = path.resolve(arg.split('=')[1].replace(/^['"]|['"]$/g, ''));
  if (arg === '--sync-campuses' || arg === '--pt-list') syncCampusesFlag = true;
}

if (!allAcehFlag && !campusArg && !mhsArg && !syncCampusesFlag) {
  console.log('\n========================================================================');
  console.log('SINKRONISASI SERVER-SIDE DIREKTORI MAHASISWA ACEH');
  console.log('========================================================================');
  console.log('Perintah yang tersedia:');
  console.log('  1. Estimasi Cakupan Seluruh Aceh:');
  console.log('     node scripts/sync-runner.mjs --all-aceh');
  console.log('');
  console.log('  2. Eksekusi Sinkronisasi Seluruh Aceh (Otomatis Checkpointing):');
  console.log('     node scripts/sync-runner.mjs --all-aceh --execute');
  console.log('     node scripts/sync-runner.mjs --all-aceh --execute --campus-limit=5');
  console.log('');
  console.log('  3. Sinkronisasi Satu Kampus Spesifik (Multi-Prodi):');
  console.log('     node scripts/sync-runner.mjs --campus="Politeknik Negeri Lhokseumawe" --all-prodi');
  console.log('');
  console.log('  4. Sinkronisasi Mahasiswa Bertarget Kata Kunci:');
  console.log('     node scripts/sync-runner.mjs --campus="Nama Kampus" --mhs="Nama/NIM"');
  console.log('');
  console.log('  5. Sinkronisasi Direktori 183 Kampus Aceh:');
  console.log('     node scripts/sync-runner.mjs --sync-campuses');
  console.log('========================================================================\n');
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

function cleanString(str) {
  if (!str) return '';
  return str.trim();
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
  
  if (/^(19\d{2}|20\d{2})/.test(cleanNim)) {
    const y = parseInt(cleanNim.slice(0, 4), 10);
    if (y >= 1980 && y <= 2030) return y;
  }
  
  if (/^\d{2}/.test(cleanNim)) {
    const prefix = parseInt(cleanNim.slice(0, 2), 10);
    if (prefix >= 80 && prefix <= 99) return 1900 + prefix;
    if (prefix >= 0 && prefix <= 30) return 2000 + prefix;
  }
  
  return null;
}

function normalizeCampusName(name) {
  if (!name) return '';
  return name
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[^A-Z0-9 ]/g, '')
    .trim();
}

// Load Checkpoint
function loadCheckpoint(filePath) {
  if (resetCheckpointFlag && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log('File checkpoint di-reset sesuai permintaan (--reset-checkpoint).');
    } catch {
      // ignore
    }
  }

  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        completed_campuses: Array.isArray(data.completed_campuses) ? data.completed_campuses : [],
        completed_prodis_by_campus: data.completed_prodis_by_campus || {},
        capped_prodis_by_campus: data.capped_prodis_by_campus || {},
        stats: data.stats || {
          campuses_processed: 0,
          prodis_processed: 0,
          total_discovered: 0,
          total_inserted: 0,
          total_updated: 0,
          total_skipped_guard: 0,
          total_capped_prodis: 0,
          total_errors: 0,
        },
      };
    } catch (e) {
      console.warn('Gagal membaca file checkpoint:', e.message);
    }
  }

  return {
    completed_campuses: [],
    completed_prodis_by_campus: {},
    capped_prodis_by_campus: {},
    stats: {
      campuses_processed: 0,
      prodis_processed: 0,
      total_discovered: 0,
      total_inserted: 0,
      total_updated: 0,
      total_skipped_guard: 0,
      total_capped_prodis: 0,
      total_errors: 0,
    },
  };
}

function saveCheckpoint(filePath, checkpoint) {
  try {
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          updated_at: new Date().toISOString(),
          ...checkpoint,
        },
        null,
        2
      )
    );
  } catch (err) {
    console.warn('Gagal menyimpan checkpoint:', err.message);
  }
}

async function run() {
  console.log('========================================================');
  console.log('SINKRONISASI SERVER-SIDE DIREKTORI MAHASISWA ACEH');
  console.log('Target Database:', SUPABASE_URL);
  console.log('Waktu mulai    :', new Date().toISOString());
  console.log('========================================================');

  // ====================================================================
  // 1. SINKRONISASI SELURUH KAMPUS ACEH (ALL-ACEH MULTI-CAMPUS SYNC)
  // ====================================================================
  if (allAcehFlag) {
    console.log('\n--- SINKRONISASI MULTI-KAMPUS SELURUH PROVINSI ACEH ---');

    // 1.1 Ambil daftar seluruh kampus dari tabel institutions di Supabase
    console.log('Mengambil daftar kampus Aceh dari tabel institutions di Supabase...');
    const allInstitutions = await supabaseRequest('institutions?select=kode_pt,nama,nama_singkat,metadata&order=nama.asc');

    if (!allInstitutions || allInstitutions.length === 0) {
      console.error('Tidak ada data kampus di database. Jalankan --sync-campuses terlebih dahulu.');
      return;
    }

    const totalCampuses = allInstitutions.length;
    console.log(`Ditemukan ${totalCampuses} perguruan tinggi terdaftar di Supabase.`);

    const checkpoint = loadCheckpoint(checkpointFileArg);
    const completedSet = new Set(checkpoint.completed_campuses);
    const remainingCampuses = allInstitutions.filter((c) => !completedSet.has(c.kode_pt.trim()));

    // 1.2 MODE ESTIMASI (Jika tidak menyertakan --execute)
    if (!executeFlag) {
      console.log('\n========================================================');
      console.log('ESTIMASI CAKUPAN & INFORMASI PELAKSANAAN');
      console.log('========================================================');
      console.log(`Total Perguruan Tinggi di Database : ${totalCampuses} kampus`);
      console.log(`Kampus Sudah Selesai (Checkpoint)  : ${completedSet.size} kampus`);
      console.log(`Kampus Belum Selesai               : ${remainingCampuses.length} kampus`);
      
      const avgProdiPerCampus = 10;
      const estimatedTotalProdi = remainingCampuses.length * avgProdiPerCampus;
      const estimatedRequests = remainingCampuses.length + estimatedTotalProdi;
      const estimatedMinutes = Math.ceil((estimatedRequests * delayMsArg) / 60000);

      console.log(`Estimasi Rata-rata Prodi per Kampus: ~${avgProdiPerCampus} prodi`);
      console.log(`Estimasi Total Request HTTP        : ~${estimatedRequests} request`);
      console.log(`Jeda Permintaan (Rate-limit)       : ${delayMsArg} ms`);
      console.log(`Estimasi Durasi Sinkronisasi Penuh : ~${estimatedMinutes} menit (tergantung respons PDDikti)`);
      console.log(`File Checkpoint                    : ${checkpointFileArg}`);
      console.log('\nCARA MENJALANKAN:');
      console.log('  Eksekusi penuh seluruh kampus:');
      console.log('    node scripts/sync-runner.mjs --all-aceh --execute');
      console.log('');
      console.log('  Eksekusi bertahap (contoh: 3 kampus per sesi):');
      console.log('    node scripts/sync-runner.mjs --all-aceh --execute --campus-limit=3');
      console.log('');
      console.log('  Resiliensi: Jika proses terhenti (Ctrl+C atau batas waktu), jalankan kembali');
      console.log('  perintah di atas dan proses akan otomatis melanjutkan dari checkpoint terakhir');
      console.log('  tanpa mengulang kampus yang sudah selesai.');
      console.log('========================================================\n');
      return;
    }

    // 1.3 EKSEKUSI PENUH SINKRONISASI
    const targetCampuses = campusLimitArg > 0 ? remainingCampuses.slice(0, campusLimitArg) : remainingCampuses;

    console.log(`\nMemulai sinkronisasi untuk ${targetCampuses.length} kampus pada sesi ini...`);
    console.log(`(Jeda per request: ${delayMsArg}ms, Hard-cap 100 ditangani dengan penandaan)\n`);

    // Catat log permulaan run di sync_runs
    let runId = null;
    try {
      const createdRun = await supabaseRequest('sync_runs', {
        method: 'POST',
        body: JSON.stringify([{
          status: 'running',
          target_type: 'mhs_all_aceh_sync',
          target_keyword: `Seluruh Aceh (${targetCampuses.length} PT / Sesi Ini)`,
          processed_count: checkpoint.stats.total_discovered,
          inserted_count: checkpoint.stats.total_inserted,
          updated_count: checkpoint.stats.total_updated,
        }]),
      });
      if (createdRun && createdRun[0]) runId = createdRun[0].id;
    } catch {
      // ignore run log creation error
    }

    for (let cIdx = 0; cIdx < targetCampuses.length; cIdx++) {
      const pt = targetCampuses[cIdx];
      const kodePt = pt.kode_pt.trim();
      const namaPt = pt.nama.trim();

      console.log(`\n--------------------------------------------------------`);
      console.log(`[KAMPUS ${cIdx + 1}/${targetCampuses.length}] [${kodePt}] ${namaPt}`);
      console.log(`--------------------------------------------------------`);

      // 1. Dapatkan nama dan identitas resmi PDDikti dari kode_pt
      let pddiktiPtName = namaPt;
      let pddiktiPtSingkat = pt.nama_singkat || '';
      try {
        const ptLookupRes = await fetchWithRetry(`${BASE_URL}/api/pencarian/pt/${encodeURIComponent(kodePt)}`, { headers: HEADERS });
        if (ptLookupRes.ok) {
          const ptLookupJson = await ptLookupRes.json();
          const exactPt = (ptLookupJson.data || []).find((p) => (p.kode || '').trim() === kodePt);
          if (exactPt && exactPt.nama) {
            pddiktiPtName = exactPt.nama.trim();
            if (exactPt.nama_singkat) pddiktiPtSingkat = exactPt.nama_singkat.trim();
          }
        }
      } catch {
        // Fallback ke namaPt dari database
      }

      const normTargetName = normalizeCampusName(pddiktiPtName);
      const normDbName = normalizeCampusName(namaPt);
      const normTargetSingkat = normalizeCampusName(pddiktiPtSingkat);

      // 2. Ambil prodi dari PDDikti
      await sleep(delayMsArg);
      let rawProdis = [];
      try {
        const prodiRes = await fetchWithRetry(`${BASE_URL}/api/pencarian/prodi/${encodeURIComponent(pddiktiPtName)}`, { headers: HEADERS });
        if (prodiRes.ok) {
          const prodiJson = await prodiRes.json();
          rawProdis = prodiJson.data || [];
        }
      } catch (err) {
        console.error(`  Gagal mengambil prodi: ${err.message}`);
        checkpoint.stats.total_errors++;
        continue;
      }

      // Filter prodi yang BENAR-BENAR milik kampus ini (cocokan nama ter-normalisasi, bukan substring liar)
      const campusProdis = rawProdis.filter((p) => {
        const normPt = normalizeCampusName(p.pt);
        const normPtSingkat = normalizeCampusName(p.pt_singkat);
        return normPt === normTargetName || (normDbName && normPt === normDbName) || (normTargetSingkat && normPtSingkat === normTargetSingkat);
      });

      console.log(`  Ditemukan ${campusProdis.length} program studi resmi terverifikasi di PDDikti.`);

      if (campusProdis.length === 0) {
        console.log(`  Tidak ada program studi yang ditemukan. Menandai kampus selesai.`);
        if (!checkpoint.completed_campuses.includes(kodePt)) {
          checkpoint.completed_campuses.push(kodePt);
        }
        saveCheckpoint(checkpointFileArg, checkpoint);
        continue;
      }

      // Ambil daftar prodi yang sudah selesai untuk kampus ini
      if (!checkpoint.completed_prodis_by_campus[kodePt]) {
        checkpoint.completed_prodis_by_campus[kodePt] = [];
      }
      if (!checkpoint.capped_prodis_by_campus[kodePt]) {
        checkpoint.capped_prodis_by_campus[kodePt] = [];
      }

      const completedProdiSet = new Set(checkpoint.completed_prodis_by_campus[kodePt]);
      const prodisToProcess = prodiLimitArg > 0
        ? campusProdis.filter((p) => !completedProdiSet.has(p.nama.trim())).slice(0, prodiLimitArg)
        : campusProdis.filter((p) => !completedProdiSet.has(p.nama.trim()));

      console.log(`  Prodi yang diproses pada sesi ini: ${prodisToProcess.length} prodi.`);

      let campusInsertedCount = 0;
      let campusHadError = false;

      for (let pIdx = 0; pIdx < prodisToProcess.length; pIdx++) {
        const prodi = prodisToProcess[pIdx];
        const prodiNama = cleanString(prodi.nama);
        const prodiJenjang = cleanString(prodi.jenjang) || null;

        await sleep(delayMsArg);

        let rawList = [];
        try {
          const mhsRes = await fetchWithRetry(`${BASE_URL}/api/pencarian/mhs/${encodeURIComponent(prodiNama + ' ' + pddiktiPtName)}`, { headers: HEADERS });
          if (mhsRes.ok) {
            const mhsJson = await mhsRes.json();
            rawList = mhsJson.data || [];
          }
        } catch (err) {
          console.warn(`    Gagal mencari mahasiswa prodi ${prodiNama}: ${err.message}`);
          checkpoint.stats.total_errors++;
          campusHadError = true;
          continue;
        }

        const isCapped = rawList.length >= 100;
        checkpoint.stats.total_discovered += rawList.length;

        if (isCapped) {
          console.log(`    [PRODI ${pIdx + 1}/${prodisToProcess.length}] ${prodiJenjang} ${prodiNama}: ${rawList.length} mahasiswa diterima.`);
          console.log(`      -> [PERHATIAN] Hasil mencapai batas 100 PDDikti (berpotensi belum lengkap). Dicatat & lanjut.`);
          if (!checkpoint.capped_prodis_by_campus[kodePt].includes(prodiNama)) {
            checkpoint.capped_prodis_by_campus[kodePt].push(prodiNama);
          }
          checkpoint.stats.total_capped_prodis++;
        } else {
          console.log(`    [PRODI ${pIdx + 1}/${prodisToProcess.length}] ${prodiJenjang} ${prodiNama}: ${rawList.length} mahasiswa diterima.`);
        }

        const validStudentsToUpsert = [];
        const seenInBatch = new Set();

        for (let i = 0; i < Math.min(rawList.length, maxPerProdiArg); i++) {
          const item = rawList[i];
          const nim = cleanString(item.nim);
          const nama = cleanString(item.nama);
          const studentPt = cleanString(item.nama_pt);

          if (!nim || !nama) continue;

          // GUARD KONTAMINASI ANTAR-KAMPUS KETAT:
          const normStudentPt = normalizeCampusName(studentPt);
          const normStudentPtSingkat = normalizeCampusName(item.sinkatan_pt);
          const isMatchedCampus = normStudentPt === normTargetName || 
            (normDbName && normStudentPt === normDbName) || 
            (normTargetSingkat && normStudentPtSingkat === normTargetSingkat);

          if (!isMatchedCampus) {
            checkpoint.stats.total_skipped_guard++;
            continue;
          }

          // DEDUPLIKASI INTRA-BATCH:
          // Menghindari error PostgreSQL 21000 ("ON CONFLICT DO UPDATE command cannot affect row a second time")
          const dedupeKey = `${kodePt}:${nim}`;
          if (seenInBatch.has(dedupeKey)) continue;
          seenInBatch.add(dedupeKey);

          const tahunMasuk = inferTahunMasuk(nim, null);

          validStudentsToUpsert.push({
            kode_pt: kodePt,
            nama_pt: namaPt,
            nim,
            nama,
            kode_prodi: null,
            prodi: cleanString(item.nama_prodi) || prodiNama,
            jenjang: prodiJenjang,
            status: 'Aktif',
            tanggal_masuk: null,
            tahun_masuk: tahunMasuk,
            jenis_kelamin: null,
            raw_detail: {},
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }

        // Batch Upsert ke Supabase
        if (validStudentsToUpsert.length > 0) {
          try {
            await supabaseRequest('students?on_conflict=kode_pt,nim', {
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates' },
              body: JSON.stringify(validStudentsToUpsert),
            });
            campusInsertedCount += validStudentsToUpsert.length;
            checkpoint.stats.total_inserted += validStudentsToUpsert.length;
            console.log(`      -> Berhasil menyimpan/memperbarui ${validStudentsToUpsert.length} mahasiswa.`);

            if (!checkpoint.completed_prodis_by_campus[kodePt].includes(prodiNama)) {
              checkpoint.completed_prodis_by_campus[kodePt].push(prodiNama);
            }
            checkpoint.stats.prodis_processed++;
            saveCheckpoint(checkpointFileArg, checkpoint);
          } catch (dbErr) {
            console.error(`      -> Gagal menyimpan batch prodi ${prodiNama}: ${dbErr.message}`);
            checkpoint.stats.total_errors++;
            campusHadError = true;
          }
        } else {
          if (!checkpoint.completed_prodis_by_campus[kodePt].includes(prodiNama)) {
            checkpoint.completed_prodis_by_campus[kodePt].push(prodiNama);
          }
          checkpoint.stats.prodis_processed++;
          saveCheckpoint(checkpointFileArg, checkpoint);
        }
      }

      // Tandai kampus selesai HANYA JIKA seluruh prodi berhasil tanpa error
      if (!campusHadError) {
        if (!checkpoint.completed_campuses.includes(kodePt)) {
          checkpoint.completed_campuses.push(kodePt);
        }
        checkpoint.stats.campuses_processed++;
        saveCheckpoint(checkpointFileArg, checkpoint);
        console.log(`  [SELESAI] Kampus ${pddiktiPtName} selesai diproses (+${campusInsertedCount} mahasiswa).`);
      } else {
        console.warn(`  [TERTUNDA] Kampus ${pddiktiPtName} belum ditandai selesai karena ada prodi yang gagal/terpotong.`);
      }
    }

    // Perbarui riwayat di sync_runs
    if (runId) {
      await supabaseRequest(`sync_runs?id=eq.${runId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ended_at: new Date().toISOString(),
          status: 'success',
          processed_count: Number(checkpoint.stats.total_discovered) || 0,
          inserted_count: Number(checkpoint.stats.total_inserted) || 0,
          updated_count: Number(checkpoint.stats.total_updated) || 0,
        }),
      });
    }

    console.log('\n========================================================');
    console.log('RINGKASAN SINKRONISASI SELURUH ACEH');
    console.log('========================================================');
    console.log(`Total Kampus Selesai          : ${checkpoint.completed_campuses.length} / ${totalCampuses}`);
    console.log(`Total Prodi Diproses          : ${checkpoint.stats.prodis_processed}`);
    console.log(`Total Data Mahasiswa Diterima : ${checkpoint.stats.total_discovered}`);
    console.log(`Total Mahasiswa Tersimpan     : ${checkpoint.stats.total_inserted}`);
    console.log(`Prodi Berpotensi Capped (>100): ${checkpoint.stats.total_capped_prodis}`);
    console.log(`Dilewati Guard Kontaminasi    : ${checkpoint.stats.total_skipped_guard || 0}`);
    console.log(`Total Error                   : ${checkpoint.stats.total_errors || 0}`);
    console.log(`File Checkpoint               : ${checkpointFileArg}`);
    console.log('========================================================\n');
    return;
  }

  // ====================================================================
  // 2. SINKRONISASI DIREKTORI KAMPUS DARI /api/pt/locations
  // ====================================================================
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

    const acehCampuses = allPts.filter((it) => {
      const kab = (it.kab_kota || '').toLowerCase();
      const nama = (it.nama || '').toLowerCase();
      if (kab.includes('karo')) return false;
      return acehKabTokens.some((k) => kab.includes(k)) || nama.includes('aceh');
    });

    console.log(`Ditemukan ${acehCampuses.length} perguruan tinggi terverifikasi di Provinsi Aceh.`);

    const existingInsts = await supabaseRequest('institutions?select=kode_pt,nama,nama_singkat,metadata');
    const existingMap = new Map();
    (existingInsts || []).forEach((i) => existingMap.set(i.kode_pt.trim(), i));

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

    console.log('\n--- HASIL SINKRONISASI KAMPUS ---');
    console.log(`Total PT Aceh ditemukan dari PDDikti : ${acehCampuses.length}`);
    console.log(`Kampus Baru Ditambahkan              : ${newCount}`);
    console.log(`Kampus Sudah Ada (Metadata Diperbarui): ${updatedCount}`);
    console.log(`Error                                : ${errCount}`);
    console.log(`Total record PT di database sekarang : ${existingMap.size + newCount}`);
  }

  // ====================================================================
  // 3. SINKRONISASI MAHASISWA SATU KAMPUS SPESIFIK (MULTI-PRODI)
  // ====================================================================
  if (campusArg && allProdiFlag) {
    console.log(`\n--- SINKRONISASI MAHASISWA MULTI-PRODI (KAMPUS TUNGGAL) ---`);
    console.log(`Target Kampus: "${campusArg}"`);

    const foundInsts = await supabaseRequest(`institutions?nama=ilike.*${encodeURIComponent(campusArg)}*&select=kode_pt,nama,nama_singkat&limit=5`);
    let targetInst = foundInsts && foundInsts.length > 0 ? foundInsts[0] : null;
    if (!targetInst) {
      console.warn(`Kampus "${campusArg}" belum terdaftar di database. Menggunakan data input.`);
      targetInst = { kode_pt: '005016', nama: campusArg };
    }

    const kodePt = targetInst.kode_pt.trim();
    const namaPt = targetInst.nama.trim();
    console.log(`Kampus Teridentifikasi: [${kodePt}] ${namaPt}`);

    const prodiRes = await fetchWithRetry(`${BASE_URL}/api/pencarian/prodi/${encodeURIComponent(namaPt)}`, { headers: HEADERS });
    if (!prodiRes.ok) {
      console.error(`Gagal mengambil prodi: HTTP ${prodiRes.status}`);
      return;
    }

    const prodiJson = await prodiRes.json();
    const rawProdiList = prodiJson.data || [];
    const targetUpper = namaPt.toUpperCase();
    const campusProdis = rawProdiList.filter((p) => {
      const ptName = (p.pt || '').toUpperCase();
      const ptSingkat = (p.pt_singkat || '').toUpperCase();
      return ptName.includes(targetUpper) || targetUpper.includes(ptName) || (targetInst.nama_singkat && ptSingkat.includes(targetInst.nama_singkat.toUpperCase()));
    });

    console.log(`Ditemukan ${campusProdis.length} program studi resmi untuk ${namaPt}.`);

    const prodisToProcess = prodiLimitArg > 0 ? campusProdis.slice(0, prodiLimitArg) : campusProdis;
    let totalDiscovered = 0;
    let totalInserted = 0;
    let totalCapped = 0;

    for (let pIdx = 0; pIdx < prodisToProcess.length; pIdx++) {
      const prodi = prodisToProcess[pIdx];
      const prodiNama = cleanString(prodi.nama);
      const prodiJenjang = cleanString(prodi.jenjang) || null;
      console.log(`\n[PRODI ${pIdx + 1}/${prodisToProcess.length}] ${prodiJenjang} ${prodiNama}...`);

      await sleep(delayMsArg);

      let mhsRes;
      try {
        mhsRes = await fetchWithRetry(`${BASE_URL}/api/pencarian/mhs/${encodeURIComponent(prodiNama + ' ' + namaPt)}`, { headers: HEADERS });
      } catch (err) {
        console.error(`  Gagal mencari mahasiswa: ${err.message}`);
        continue;
      }

      if (!mhsRes.ok) continue;

      const mhsJson = await mhsRes.json();
      const rawList = mhsJson.data || [];
      totalDiscovered += rawList.length;

      if (rawList.length >= 100) {
        totalCapped++;
        console.log(`  PDDikti mengembalikan ${rawList.length} mahasiswa (Mencapai batas 100, berpotensi belum lengkap).`);
      } else {
        console.log(`  PDDikti mengembalikan ${rawList.length} mahasiswa.`);
      }

      const validStudentsToUpsert = [];

      for (let i = 0; i < Math.min(rawList.length, maxPerProdiArg); i++) {
        const item = rawList[i];
        const nim = cleanString(item.nim);
        const nama = cleanString(item.nama);
        const studentPt = cleanString(item.nama_pt);

        if (!nim || !nama) continue;

        const studentPtUpper = studentPt.toUpperCase();
        if (!studentPtUpper.includes(targetUpper) && !targetUpper.includes(studentPtUpper)) {
          continue;
        }

        const tahunMasuk = inferTahunMasuk(nim, null);

        validStudentsToUpsert.push({
          kode_pt: kodePt,
          nama_pt: namaPt,
          nim,
          nama,
          kode_prodi: null,
          prodi: cleanString(item.nama_prodi) || prodiNama,
          jenjang: prodiJenjang,
          status: 'Aktif',
          tanggal_masuk: null,
          tahun_masuk: tahunMasuk,
          jenis_kelamin: null,
          raw_detail: {},
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      if (validStudentsToUpsert.length > 0) {
        try {
          await supabaseRequest('students?on_conflict=kode_pt,nim', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(validStudentsToUpsert),
          });
          totalInserted += validStudentsToUpsert.length;
          console.log(`  -> Berhasil menyimpan ${validStudentsToUpsert.length} mahasiswa dari prodi ${prodiNama}.`);
        } catch (dbErr) {
          console.error(`  -> Gagal menyimpan batch prodi ${prodiNama}: ${dbErr.message}`);
        }
      }
    }

    console.log('\n========================================================');
    console.log('HASIL SINKRONISASI MULTI-PRODI');
    console.log(`Total Prodi Diproses      : ${prodisToProcess.length}`);
    console.log(`Total Data Diterima       : ${totalDiscovered}`);
    console.log(`Total Mahasiswa Tersimpan : ${totalInserted}`);
    console.log(`Prodi Capped (>100)       : ${totalCapped}`);
    console.log('========================================================');
  }

  // ====================================================================
  // 4. SINKRONISASI MAHASISWA BERTARGET TUNGGAL (KATA KUNCI)
  // ====================================================================
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
    const list = Array.isArray(mhsJson) ? mhsJson : mhsJson.data || [];
    console.log(`Hasil diterima dari PDDikti: ${list.length} data.`);

    const toProcess = list.slice(0, maxArg);
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < toProcess.length; i++) {
      const item = toProcess[i];
      const nim = cleanString(item.nim);
      const nama = cleanString(item.nama);
      const nama_pt = cleanString(item.nama_pt);
      const prodi = cleanString(item.nama_prodi) || null;

      if (campusArg) {
        const targetUpper = campusArg.toUpperCase().trim();
        const studentPtUpper = nama_pt.toUpperCase().trim();
        if (!studentPtUpper.includes(targetUpper) && !targetUpper.includes(studentPtUpper)) {
          skipped++;
          continue;
        }
      }

      let kode_pt = '';
      if (nama_pt) {
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

      await supabaseRequest('institutions', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify([{ kode_pt, nama: nama_pt }]),
      });

      const tahunMasuk = inferTahunMasuk(nim, null);

      await supabaseRequest('students?on_conflict=kode_pt,nim', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify([{
          kode_pt,
          nama_pt,
          nim,
          nama,
          kode_prodi: null,
          prodi,
          jenjang: null,
          status: 'Aktif',
          tanggal_masuk: null,
          tahun_masuk: tahunMasuk,
          jenis_kelamin: null,
          raw_detail: {},
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }]),
      });

      inserted++;
      console.log(`  [SIMPAN] ${nama.slice(0, 2)}*** [NIM: ${nim.slice(0, 2)}***] (${nama_pt} - ${prodi || '-'})`);
    }

    console.log('\n--- HASIL SINKRONISASI BERTARGET ---');
    console.log(`Total Diproses         : ${toProcess.length}`);
    console.log(`Data Mahasiswa Disimpan: ${inserted}`);
    console.log(`Dilewati Guard/Valid   : ${skipped}`);
  }

  console.log('\nSelesai.');
}

run().catch(console.error);
