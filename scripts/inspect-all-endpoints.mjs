const BUNDLE_URL = 'https://pddikti.kemdiktisaintek.go.id/static/js/main.b398a8dd.js';

async function dumpAllPDDiktiEndpoints() {
  console.log('Downloading PDDikti main bundle...');
  const res = await fetch(BUNDLE_URL);
  const t = await res.text();

  const p1 = t.slice(0, 1139);
  const p2 = t.slice(1139, 910135);
  const rotEndIdx = t.indexOf('0x6bc51)', 910135) + '0x6bc51)'.length;
  const p3 = t.slice(910135, rotEndIdx) + ')';

  const combined = p1 + '\n;' + p2 + '\n;' + p3 + ';\nglobalThis.a0_0xb974 = a0_0xb974;';
  (0, eval)(combined);

  console.log('Decoder function ready! Scanning strings...');
  const allStrings = [];
  let firstErr = null;
  for (let i = 0x18b; i < 0x2400; i++) {
    try {
      const s = a0_0xb974(i);
      if (typeof s === 'string' && s.length > 0) {
        allStrings.push(s);
      }
    } catch (e) {
      if (!firstErr) firstErr = e.message;
    }
  }
  if (firstErr) console.log('First decode error encountered:', firstErr);

  console.log(`Total strings in PDDikti frontend: ${allStrings.length}`);

  // Find all API endpoints (anything starting with /api/ or containing /api/)
  const apiEndpoints = new Set();
  const routes = new Set();
  const searchParams = new Set();

  for (const s of allStrings) {
    if (s.startsWith('/api') || s.includes('/api/')) {
      apiEndpoints.add(s);
    } else if (s.startsWith('/')) {
      routes.add(s);
    }
  }

  console.log('\n======================================================');
  console.log('PDDIKTI /api/ ENDPOINTS DISCOVERED IN SOURCE CODE:');
  console.log('======================================================');
  Array.from(apiEndpoints).sort().forEach(ep => console.log('  ', ep));

  console.log('\n======================================================');
  console.log('FRONTEND ROUTES IN PDDIKTI:');
  console.log('======================================================');
  Array.from(routes).sort().forEach(r => console.log('  ', r));

  // Search for mentions of "provinsi", "wilayah", "aceh", "page", "limit", "filter"
  const filterTerms = allStrings.filter(s => 
    /provinsi|wilayah|daerah|aceh|page|limit|offset|per_page|halaman|spesifik|pencarian/i.test(s)
  );

  console.log('\n======================================================');
  console.log('RELEVANT FILTER / PAGINATION STRINGS:');
  console.log('======================================================');
  Array.from(new Set(filterTerms)).sort().forEach(f => console.log('  ', f));
}

dumpAllPDDiktiEndpoints().catch(console.error);
