import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env.local', 'utf8');
for (const line of envContent.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BASE_URL = 'https://pddikti.kemdiktisaintek.go.id';

async function compare() {
  const { data: dbInsts } = await sb.from('institutions').select('*');
  const dbMap = new Map();
  dbInsts.forEach(i => dbMap.set(i.kode_pt.trim(), i));
  console.log(`Currently in Supabase: ${dbMap.size} institutions`);

  // Fetch official locations from PDDikti
  console.log('Fetching PDDikti /api/pt/locations...');
  const res = await fetch(`${BASE_URL}/api/pt/locations`, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': BASE_URL }
  });
  const json = await res.json();
  const allPts = json.data || [];
  console.log(`Total nationwide PTs from PDDikti locations: ${allPts.length}`);

  const acehKabKota = [
    'aceh', 'banda aceh', 'sabang', 'lhokseumawe', 'langsa', 'subulussalam',
    'bireuen', 'pidie', 'pidie jaya', 'simeulue', 'gayo lues', 'bener meriah',
    'nagan raya', 'kutacane', 'takengon', 'meulaboh', 'tapaktuan', 'singkil',
    'idi', 'lhoksukon', 'sigli', 'calang', 'sinabang', 'blangkejeren', 'blangpidie', 'karang baru'
  ];

  const acehFromLocations = allPts.filter(it => {
    const kab = (it.kab_kota || '').toLowerCase();
    const nama = (it.nama || '').toLowerCase();
    // Exclude Karo (North Sumatra) unless verified
    if (kab.includes('karo')) return false;
    return acehKabKota.some(k => kab.includes(k)) || nama.includes('aceh');
  });

  console.log(`Total Aceh PTs identified from official locations: ${acehFromLocations.length}`);

  let alreadyInDb = 0;
  let newToDb = [];
  let updateCandidates = [];

  for (const loc of acehFromLocations) {
    const kode = loc.kode.trim();
    if (dbMap.has(kode)) {
      alreadyInDb++;
      updateCandidates.push({ kode, nama: loc.nama, kab_kota: loc.kab_kota });
    } else {
      newToDb.push({ kode, nama: loc.nama, kab_kota: loc.kab_kota, kelompok: loc.kelompok, pembina: loc.pembina });
    }
  }

  console.log(`Matching in DB: ${alreadyInDb}`);
  console.log(`New PTs not in DB yet: ${newToDb.length}`);
  if (newToDb.length > 0) {
    console.log('Sample new PTs to add:');
    newToDb.forEach((n, idx) => console.log(`  ${idx + 1}. [${n.kode}] ${n.nama} (${n.kab_kota || '-'})`));
  }
}

compare().catch(console.error);
