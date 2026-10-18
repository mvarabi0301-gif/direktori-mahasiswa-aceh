import vm from 'node:vm';

const BUNDLE_URL = 'https://pddikti.kemdiktisaintek.go.id/static/js/main.b398a8dd.js';

async function extractStrings() {
  console.log('Downloading bundle...');
  const res = await fetch(BUNDLE_URL);
  const text = await res.text();

  const nextCall = text.indexOf('(a0_0x5239,', 910000);
  const endParen = text.indexOf(')', nextCall) + 1;

  console.log('Rotator slice up to index:', endParen);
  let setupCode = text.slice(0, endParen) + ';';
  // Insert semicolon before (function
  setupCode = setupCode.replace('}(function', '};(function');

  const sandbox = {};
  vm.createContext(sandbox);

  try {
    vm.runInContext(setupCode, sandbox);
    console.log('Obfuscator engine initialized successfully!');

    const allStrings = new Set();
    const interesting = [];

    // Let's decode indices
    for (let i = 0x18b; i < 0x2500; i++) {
      try {
        const val = vm.runInContext(`a0_0xb974(${i})`, sandbox);
        if (typeof val === 'string' && val.length > 0) {
          allStrings.add(val);
          if (
            val.startsWith('/') ||
            val.includes('api') ||
            val.includes('pencarian') ||
            val.includes('detail') ||
            val.includes('provinsi') ||
            val.includes('wilayah') ||
            val.includes('filter') ||
            val.includes('pt') ||
            val.includes('mhs') ||
            val.includes('perguruan') ||
            val.includes('mahasiswa')
          ) {
            interesting.push({ hex: '0x' + i.toString(16), val });
          }
        }
      } catch (e) {
        // out of bounds
      }
    }

    console.log(`Decoded ${allStrings.size} total strings.`);
    console.log('\n--- INTERESTING DECODED STRINGS & API ENDPOINTS: ---');
    interesting.forEach(item => console.log(`[${item.hex}] ${item.val}`));

  } catch (err) {
    console.error('VM initialization error:', err.message);
  }
}

extractStrings().catch(console.error);
