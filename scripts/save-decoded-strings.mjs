import fs from 'node:fs';

const BUNDLE_URL = 'https://pddikti.kemdiktisaintek.go.id/static/js/main.b398a8dd.js';

async function saveAllStrings() {
  console.log('Downloading PDDikti main bundle...');
  const res = await fetch(BUNDLE_URL);
  const t = await res.text();

  const p1 = t.slice(0, 1139);
  const p2 = t.slice(1139, 910135);
  const rotEndIdx = t.indexOf('0x6bc51)', 910135) + '0x6bc51)'.length;
  const p3 = t.slice(910135, rotEndIdx) + ')';

  const combined = p1 + '\n;' + p2 + '\n;' + p3 + ';\nglobalThis.a0_0xb974 = a0_0xb974;';
  (0, eval)(combined);

  console.log('Decoder ready. Collecting strings...');
  const allStrings = [];
  for (let i = 0x18b; i < 0x2400; i++) {
    try {
      const s = a0_0xb974(i);
      if (typeof s === 'string' && s.length > 0) {
        allStrings.push({ index: i, hex: '0x' + i.toString(16), value: s });
      }
    } catch (e) {}
  }

  console.log(`Decoded ${allStrings.length} strings. Saving to scripts/pddikti-strings.json`);
  fs.writeFileSync('scripts/pddikti-strings.json', JSON.stringify(allStrings, null, 2), 'utf8');

  // Filter specific endpoints
  const endpoints = allStrings
    .map(x => x.value)
    .filter(s => s.startsWith('/') || s.includes('api/') || s.includes('pencarian') || s.includes('detail') || s.includes('pt') || s.includes('mhs') || s.includes('prodi'));

  console.log('Candidate endpoints count:', endpoints.length);
  const uniqueEndpoints = Array.from(new Set(endpoints)).sort();
  fs.writeFileSync('scripts/pddikti-endpoints.txt', uniqueEndpoints.join('\n'), 'utf8');
  console.log('Saved endpoints to scripts/pddikti-endpoints.txt');
}

saveAllStrings().catch(console.error);
