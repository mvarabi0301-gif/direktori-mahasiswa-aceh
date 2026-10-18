const BUNDLE_URL = 'https://pddikti.kemdiktisaintek.go.id/static/js/main.b398a8dd.js';

async function deobfuscateStrings() {
  console.log('Downloading bundle to analyze string array...');
  const res = await fetch(BUNDLE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
  });
  const text = await res.text();

  // Find string array definition: usually function _0x...() { const _0x... = ['...', '...']; ... return _0x...; }
  // Or match arrays of strings: ['...', '...']
  const arrayRegex = /function\s+(_0x[a-f0-9]+)\s*\(\)\s*\{\s*const\s+(_0x[a-f0-9]+)\s*=\s*(\[.+?\]);/s;
  const match = text.match(/function\s+(_0x[a-f0-9]+)\s*\(\)\s*\{\s*(?:var|const|let)\s+([a-zA-Z0-9_$]+)\s*=\s*(\[[^;]+?\]);\s*return/);
  
  if (match) {
    console.log('Found string array function:', match[1]);
    try {
      const arr = eval(match[3]);
      console.log('Total strings in array:', arr.length);
      
      const apiStrings = arr.filter(s => typeof s === 'string' && (s.includes('api') || s.includes('pencarian') || s.includes('mhs') || s.includes('detail') || s.includes('provinsi') || s.includes('pt') || s.includes('filter')));
      console.log('\n--- Relevant strings in string array: ---');
      apiStrings.forEach(s => console.log('  ', s));
    } catch (e) {
      console.error('Eval error:', e.message);
    }
  } else {
    console.log('No direct function match, searching for string array directly...');
    // Search for array of strings containing "/api/" or "pencarian"
    const pMatches = text.match(/["'](\/(?:api|pencarian)[^"']*)["']/g);
    console.log('Regex /api/ or /pencarian/ matches:', pMatches);
  }
}

deobfuscateStrings().catch(console.error);
