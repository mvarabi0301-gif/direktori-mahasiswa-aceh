import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env.local', 'utf8');
for (const line of envContent.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: insts, count: instCount, error: instErr } = await sb.from('institutions').select('kode_pt, nama, nama_singkat', { count: 'exact' });
  const { data: stds, count: stdCount, error: stdErr } = await sb.from('students').select('kode_pt, nim, nama, nama_pt', { count: 'exact' });
  const { data: runs, count: runCount, error: runErr } = await sb.from('sync_runs').select('id, status, target_keyword', { count: 'exact' });

  if (instErr) console.error('instErr:', instErr.message);
  if (stdErr) console.error('stdErr:', stdErr.message);
  if (runErr) console.error('runErr:', runErr.message);

  console.log({ instCount, stdCount, runCount });
  console.log('Institutions in DB:');
  insts?.forEach((i, idx) => console.log(` ${idx + 1}. [${i.kode_pt}] ${i.nama} (${i.nama_singkat || '-'})`));
  console.log('Students in DB:');
  stds?.forEach((s, idx) => console.log(` ${idx + 1}. [${s.kode_pt}] ${s.nim} - ${s.nama.slice(0, 2)}*** (${s.nama_pt})`));
}

check().catch(console.error);
