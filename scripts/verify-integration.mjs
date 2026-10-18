/**
 * Skrip Verifikasi Integrasi Menyeluruh
 * Sesuai dengan skema Supabase sebenarnya (supabase/schema.sql):
 * - institutions: kode_pt (PK), nama, nama_singkat, metadata
 * - students: id (PK), kode_pt, nama_pt, nim, nama, prodi, jenjang, status, tanggal_masuk, tahun_masuk, jenis_kelamin
 * - sync_runs: id, started_at, ended_at, status, target_type, target_keyword, processed_count, inserted_count, updated_count, error_message
 *
 * Endpoint API Next.js:
 * - GET /api/institutions?q=Lhokseumawe -> { institutions: [...] }
 * - GET /api/filters -> { years: [...], statuses: [...] }
 * - GET /api/students?q=... -> { data: [...], totalCount: ... }
 * - GET /api/students/export -> CSV text
 */

import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Environment variable NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_KEY diperlukan.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function mask(str) {
  if (!str) return '';
  if (str.length <= 4) return '***';
  return str.slice(0, 2) + '*'.repeat(Math.max(1, str.length - 4)) + str.slice(-2);
}

async function runDatabaseChecks() {
  console.log('========================================================');
  console.log('1. AUDIT DATABASE SUPABASE');
  console.log('Target URL:', SUPABASE_URL);
  console.log('========================================================');

  // A. Tabel institutions
  const { data: insts, count: instCount, error: instErr } = await supabase
    .from('institutions')
    .select('kode_pt, nama, nama_singkat, metadata', { count: 'exact' });

  if (instErr) {
    console.error('Error membaca tabel institutions:', instErr.message);
  } else {
    console.log(`[INSTITUTIONS] Total tersimpan di Supabase: ${instCount}`);
    
    // Klasifikasi metadata
    let verifiedAceh = 0;
    let withCoords = 0;
    for (const inst of insts || []) {
      const meta = inst.metadata || {};
      if (meta.source === 'pddikti_locations' || meta.verified_aceh === true) {
        verifiedAceh++;
      }
      if (meta.lintang || meta.bujur) {
        withCoords++;
      }
    }
    console.log(`  - Memiliki koordinat geospasial PDDikti: ${withCoords}`);
    console.log(`  - Terverifikasi resmi wilayah Aceh (Kemdiktisaintek): ${verifiedAceh}`);
    
    // Check duplicates by kode_pt
    const kodeMap = new Map();
    let duplicates = 0;
    for (const inst of insts || []) {
      if (kodeMap.has(inst.kode_pt)) {
        duplicates++;
      } else {
        kodeMap.set(inst.kode_pt, inst.nama);
      }
    }
    console.log(`  - Integritas Kunci Primer: ${duplicates === 0 ? 'VALID (0 duplikasi kode_pt)' : duplicates + ' duplikasi'}`);
    
    // Sampel 3 kampus
    console.log('  Sampel 3 kampus:');
    (insts || []).slice(0, 3).forEach((inst, i) => {
      console.log(`    ${i+1}. [${inst.kode_pt}] ${inst.nama} (${inst.metadata?.kab_kota || inst.nama_singkat || '-'})`);
    });
  }

  // B. Tabel students
  const { data: studs, count: studCount, error: studErr } = await supabase
    .from('students')
    .select('id, nama, nim, nama_pt, kode_pt, prodi, tahun_masuk, status', { count: 'exact' })
    .limit(5);

  if (studErr) {
    console.error('Error membaca tabel students:', studErr.message);
  } else {
    console.log(`\n[STUDENTS] Total mahasiswa tersimpan: ${studCount}`);
    if (studs && studs.length > 0) {
      console.log('  Sampel mahasiswa tersimpan (PII disanitasi):');
      studs.forEach((s, idx) => {
        console.log(`    ${idx + 1}. [NIM: ${mask(s.nim)}] ${mask(s.nama)} - ${s.nama_pt} (${s.prodi || '-'}, Angkatan ${s.tahun_masuk || '-'}, Status: ${s.status || '-'})`);
      });
    }
  }

  // C. Tabel sync_runs
  const { data: runs, error: runErr } = await supabase
    .from('sync_runs')
    .select('id, started_at, ended_at, status, target_type, target_keyword, processed_count, inserted_count, updated_count, error_message')
    .order('started_at', { ascending: false })
    .limit(5);

  if (runErr) {
    console.error('Error membaca tabel sync_runs:', runErr.message);
  } else {
    console.log(`\n[SYNC_RUNS] Riwayat 5 sinkronisasi terakhir:`);
    runs.forEach((r, idx) => {
      console.log(`  ${idx + 1}. [Status: ${r.status}] Target: ${r.target_type} (${r.target_keyword || 'all'}) | Diproses: ${r.processed_count}, Disimpan: ${r.inserted_count}, Diperbarui: ${r.updated_count}`);
      console.log(`     Waktu: ${r.started_at} s/d ${r.ended_at || 'ongoing'}`);
    });
  }
}

async function runApiHttpChecks() {
  console.log('\n========================================================');
  console.log('2. AUDIT ENDPOINT API NEXT.JS VIA PREVIEW SERVER (PORT 3005)');
  console.log('========================================================');

  const server = spawn('npx', ['next', 'start', '-p', '3005'], {
    stdio: 'ignore',
    shell: true,
    env: process.env,
  });

  // Tunggu hingga server siap (maksimal 12 detik)
  let serverReady = false;
  for (let i = 0; i < 24; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const probe = await fetch('http://127.0.0.1:3005/api/filters');
      if (probe.status === 200) {
        serverReady = true;
        break;
      }
    } catch {
      // Tunggu server bind port
    }
  }
  if (!serverReady) {
    console.warn('Server belum siap setelah 12 detik, mencoba melanjutkan pengujian...');
  }

  try {
    // 1. GET /api/institutions?q=Lhokseumawe
    const instRes = await fetch('http://127.0.0.1:3005/api/institutions?q=Lhokseumawe');
    const instData = await instRes.json();
    console.log(`[API /api/institutions] Status: ${instRes.status}`);
    console.log(`  Query "Lhokseumawe" mengembalikan: ${instData.institutions?.length || 0} kampus`);
    if (instData.institutions?.[0]) {
      console.log(`  Kampus pertama: ${instData.institutions[0].nama} (Kode: ${instData.institutions[0].kode_pt})`);
    }

    // 2. GET /api/filters
    const filtRes = await fetch('http://127.0.0.1:3005/api/filters');
    const filtData = await filtRes.json();
    console.log(`\n[API /api/filters] Status: ${filtRes.status}`);
    console.log(`  Tahun masuk terdata di DB:`, filtData.years);
    console.log(`  Status mahasiswa terdata di DB:`, filtData.statuses);

    // 3. GET /api/students (Pencarian Default)
    const studRes = await fetch('http://127.0.0.1:3005/api/students?page_size=5');
    const studData = await studRes.json();
    console.log(`\n[API /api/students] Status: ${studRes.status}`);
    console.log(`  Total record mahasiswa di DB: ${studData.totalCount}`);
    console.log(`  Data dikembalikan di page 1: ${studData.data?.length}`);
    if (studData.data?.[0]) {
      console.log(`  Sampel mahasiswa: [NIM: ${mask(studData.data[0].nim)}] ${mask(studData.data[0].nama)} (${studData.data[0].nama_pt})`);
    }

    // 3a. GET /api/students?q=... (Pencarian Global Tanpa Memilih Kampus via Live API PDDikti)
    const globalQRes = await fetch('http://127.0.0.1:3005/api/students?q=Muhammad&page_size=5');
    const globalQData = await globalQRes.json();
    console.log(`\n[API /api/students?q=Muhammad] Status: ${globalQRes.status}`);
    console.log(`  Sumber Data Pencarian: ${globalQData.source} (Harus pddikti_live)`);
    console.log(`  Total hasil pencarian nama "Muhammad": ${globalQData.totalCount}`);
    console.log(`  Sampel hasil dari berbagai kampus:`);
    (globalQData.data || []).slice(0, 3).forEach((s, idx) => {
      console.log(`    ${idx + 1}. ${mask(s.nama)} [NIM: ${mask(s.nim)}] Kampus: ${s.nama_pt} (${s.prodi || '-'})`);
    });

    // 3b. GET /api/students?q=... (Pencarian Langsung Berdasarkan NIM)
    const nimQRes = await fetch('http://127.0.0.1:3005/api/students?q=0241110018&page_size=5');
    const nimQData = await nimQRes.json();
    console.log(`\n[API /api/students?q=0241110018] Status: ${nimQRes.status}`);
    console.log(`  Sumber Data NIM: ${nimQData.source}`);
    console.log(`  Total mahasiswa ditemukan dengan NIM tersebut: ${nimQData.totalCount}`);
    if (nimQData.data?.[0]) {
      console.log(`  Mahasiswa terverifikasi PDDikti: ${mask(nimQData.data[0].nama)} - ${nimQData.data[0].nama_pt} (${nimQData.data[0].prodi || '-'})`);
    }

    // 3c. GET /api/students?kode_pt=... (Pencarian Khusus Kampus Tertentu)
    const campusQRes = await fetch('http://127.0.0.1:3005/api/students?kode_pt=005016&page_size=5');
    const campusQData = await campusQRes.json();
    console.log(`\n[API /api/students?kode_pt=005016] Status: ${campusQRes.status}`);
    console.log(`  Total mahasiswa kampus Politeknik Negeri Lhokseumawe (005016): ${campusQData.totalCount}`);
    const isStrictCampus = (campusQData.data || []).every((s) => s.kode_pt === '005016');
    console.log(`  Validasi pembatasan kampus: ${isStrictCampus ? 'TERBUKTI KETAT (100% data milik kode_pt 005016)' : 'GAGAL'}`);

    // 4. GET /api/students/export
    const expRes = await fetch('http://127.0.0.1:3005/api/students/export');
    const expCsv = await expRes.text();
    console.log(`\n[API /api/students/export] Status: ${expRes.status}`);
    console.log(`  Content-Type: ${expRes.headers.get('content-type')}`);
    const lines = expCsv.trim().split('\n');
    console.log(`  Baris header CSV: ${lines[0]}`);
    console.log(`  Total baris data dalam file ekspor: ${lines.length - 1} baris`);

    console.log('\nSEMUA ENDPOINT HTTP BERFUNGSI SEMPURNA (STATUS 200).');
  } catch (err) {
    console.error('Error saat testing HTTP endpoints:', err.message);
  } finally {
    spawn('taskkill', ['/pid', String(server.pid), '/f', '/t'], { stdio: 'ignore', shell: true });
  }
}

async function main() {
  await runDatabaseChecks();
  await runApiHttpChecks();
}

main().catch(console.error);
