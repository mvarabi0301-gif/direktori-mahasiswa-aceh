/**
 * Manual Server-side Sync Runner for Direktori Mahasiswa Aceh.
 * 
 * Penggunaan:
 *   node scripts/sync-runner.mjs --sync-campuses             (Sinkronisasi seluruh PT Aceh dari endpoint lokasi resmi PDDikti)
 *   node scripts/sync-runner.mjs --campus="Politeknik Negeri Lhokseumawe" --mhs="Politeknik Negeri Lhokseumawe" --max=5
 *   node scripts/sync-runner.mjs --mhs="Nama Mahasiswa" --max=5
 * 
 * Keamanan:
 * - Memerlukan SUPABASE_SERVICE_ROLE_KEY di .env.local
 * - Menggunakan rate-limiting dan batas maksimal
 * - Dilengkapi Guard Kontaminasi Antar-Kampus
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

for (const arg of args) {
  if (arg.startsWith('--campus=')) campusArg = arg.split('=')[1].replace(/^['"]|['"]$/g, '');
  if (arg.startsWith('--mhs=')) mhsArg = arg.split('=')[1].replace(/^['"]|['"]$/g, '');
  if (arg.startsWith('--max=')) maxArg = parseInt(arg.split('=')[1], 10) || 10;
  if (arg === '--sync-campuses' || arg === '--pt-list') syncCampusesFlag = true;
}

if (!campusArg && !mhsArg && !syncCampusesFlag) {
  console.log('\n--- SINKRONISASI SERVER-SIDE MANUAL ---');
  console.log('Argumen yang didukung:');
  console.log('  --sync-campuses              (Sinkronisasi seluruh PT Aceh dari PDDikti /api/pt/locations)');
  console.log('  --campus="Nama Kampus"       (Filter/target kampus spesifik)');
  console.log('  --mhs="Keyword Mahasiswa"    (Sinkronisasi data Mahasiswa bertarget)');
  console.log('  --max=N                      (Batas maksimal mahasiswa, default 10)');
  console.log('\nContoh: node scripts/sync-runner.mjs --sync-campuses\n');
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
    const locRes = await fetch(`${BASE_URL}/api/pt/locations`, { headers: HEADERS });
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

    // Dapatkan data kampus yang sudah ada
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

    // Catat log di sync_runs
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

  // 2. SINKRONISASI MAHASISWA BERTARGET DENGAN GUARD KONTAMINASI
  if (mhsArg) {
    console.log(`\n--- SINKRONISASI MAHASISWA BERTARGET ---`);
    console.log(`Query pencarian: "${mhsArg}" (Batas proses: ${maxArg})`);
    if (campusArg) {
      console.log(`Target Kampus  : "${campusArg}" (Guard Kontaminasi Aktif)`);
    }

    const mhsRes = await fetch(`${BASE_URL}/api/pencarian/mhs/${encodeURIComponent(mhsArg)}`, { headers: HEADERS });
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
      let tahun_masuk = null;
      let jenis_kelamin = null;
      let rawDetailObj = {};

      if (item.id) {
        await sleep(650); // Respect rate-limit
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
              kode_pt = (d.kode_pt || '').trim();
              nama_pt = (d.nama_pt || '').trim() || nama_pt;
              kode_prodi = (d.kode_prodi || '').trim() || null;
              prodi = (d.prodi || '').trim() || prodi;
              jenjang = (d.jenjang || '').trim() || null;
              status = (d.status_saat_ini || '').replace(/[- ]+$/, '').trim() || 'Aktif';
              tanggal_masuk = (d.tanggal_masuk || '').trim() || null;
              if (tanggal_masuk && /^\d{4}/.test(tanggal_masuk)) {
                tahun_masuk = parseInt(tanggal_masuk.slice(0, 4), 10);
              }
              jenis_kelamin = (d.jenis_kelamin || '').trim() || null;
            }
          }
        } catch (e) {
          console.warn(`  [DETAIL ERROR] ${nama.slice(0, 2)}***: ${e.message}`);
        }
      }

      if (!kode_pt && nama_pt) {
        const found = await supabaseRequest(`institutions?nama=eq.${encodeURIComponent(nama_pt)}&select=kode_pt&limit=1`);
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

      // Cek apakah data sudah ada
      const existing = await supabaseRequest(`students?kode_pt=eq.${encodeURIComponent(kode_pt)}&nim=eq.${encodeURIComponent(nim)}&select=id&limit=1`);

      // Upsert mahasiswa dengan on_conflict=kode_pt,nim
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

    // Catat log di sync_runs
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
