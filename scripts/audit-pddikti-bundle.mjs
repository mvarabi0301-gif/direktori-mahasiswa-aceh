import fs from 'node:fs';

const BUNDLE_URL = 'https://pddikti.kemdiktisaintek.go.id/static/js/main.b398a8dd.js';

async function analyzeBundle() {
  console.log('Downloading bundle:', BUNDLE_URL);
  const res = await fetch(BUNDLE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://pddikti.kemdiktisaintek.go.id/',
    }
  });

  const text = await res.text();
  console.log('Bundle length:', text.length, 'bytes');

  // Search for /api/ matches
  const apiMatches = new Set();
  const apiRegex = /["'`](\/api\/[^"'` ]+)["'`]/g;
  let match;
  while ((match = apiRegex.exec(text)) !== null) {
    apiMatches.add(match[1]);
  }

  console.log('\n--- Direct /api/ endpoints found in bundle: ---');
  Array.from(apiMatches).sort().forEach(ep => console.log(' ', ep));

  // Also check for dynamic template string /api/ patterns
  const templateRegex = /["'`]?\/api\/[a-zA-Z0-9_\-\/$\{\}]+/g;
  const tmplMatches = new Set();
  while ((match = templateRegex.exec(text)) !== null) {
    tmplMatches.add(match[0]);
  }
  console.log('\n--- Template /api/ patterns: ---');
  Array.from(tmplMatches).sort().forEach(ep => console.log(' ', ep));

  // Check for any occurrences of "provinsi", "wilayah", "aceh", "search", "filter"
  const keywords = ['provinsi', 'wilayah', 'filter', 'pencarian', 'detail/pt', 'detail/mhs', 'detail/prodi', 'perguruan-tinggi'];
  console.log('\n--- Keyword occurrences in bundle: ---');
  for (const kw of keywords) {
    const idxs = [];
    let pos = text.indexOf(kw);
    while (pos !== -1 && idxs.length < 5) {
      idxs.push(pos);
      pos = text.indexOf(kw, pos + 1);
    }
    console.log(`Keyword "${kw}": found ${idxs.length} sample positions.`);
    for (const p of idxs) {
      const snippet = text.slice(Math.max(0, p - 60), Math.min(text.length, p + 100));
      console.log(`   [Snippet around ${p}]:`, snippet.replace(/[\r\n]+/g, ' '));
    }
  }

  // Look for any other static/js chunk files
  const chunkRegex = /static\/js\/[a-zA-Z0-9_.\-]+\.chunk\.js/g;
  const chunkMatches = new Set();
  while ((match = chunkRegex.exec(text)) !== null) {
    chunkMatches.add(match[0]);
  }
  console.log('\n--- Other JS chunk files: ---');
  Array.from(chunkMatches).forEach(c => console.log(' ', c));
}

analyzeBundle().catch(console.error);
