const BASE_URL = 'https://pddikti.kemdiktisaintek.go.id';

const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': BASE_URL,
};

async function testSearch(kw) {
  const r = await fetch(`${BASE_URL}/api/pencarian/mhs/${encodeURIComponent(kw)}`, { headers: HEADERS });
  const j = await r.json();
  const list = j.data || [];
  console.log(`Query: "${kw}" -> Total returned: ${list.length}`);
  if (list.length > 0) {
    const pnlMatches = list.filter(s => (s.nama_pt || '').includes('LHOKSEUMAWE'));
    console.log(`   Matches for PNL: ${pnlMatches.length}`);
    if (pnlMatches.length > 0) {
      console.log(`   Sample PNL: [NIM ${pnlMatches[0].nim}] Prodi: ${pnlMatches[0].nama_prodi}`);
    }
  }
}

async function run() {
  await testSearch('57301');
  await new Promise(r => setTimeout(r, 1000));
  await testSearch('62401');
  await new Promise(r => setTimeout(r, 1000));
  await testSearch('2021624');
  await new Promise(r => setTimeout(r, 1000));
  await testSearch('PNL');
}

run().catch(console.error);
