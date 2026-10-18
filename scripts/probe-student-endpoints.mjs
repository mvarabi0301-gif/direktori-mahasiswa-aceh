const BASE_URL = 'https://pddikti.kemdiktisaintek.go.id';

const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': `${BASE_URL}/`,
  'Origin': BASE_URL,
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function testEndpoint(name, url, options = {}) {
  console.log(`\n--- PROBE: ${name} ---`);
  console.log(`URL: ${url}`);
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...HEADERS,
        ...(options.headers || {}),
      }
    });
    console.log(`Status: ${res.status} ${res.statusText}`);
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json)) {
        console.log(`Array length: ${json.length}`);
        if (json.length > 0) console.log('Sample [0]:', JSON.stringify(json[0]).slice(0, 180));
      } else if (json.data) {
        if (Array.isArray(json.data)) {
          console.log(`Data array length: ${json.data.length}`);
          if (json.data.length > 0) console.log('Sample data[0]:', JSON.stringify(json.data[0]).slice(0, 180));
        } else {
          console.log('Data object keys:', Object.keys(json.data));
          console.log('Sample data:', JSON.stringify(json.data).slice(0, 180));
        }
      } else {
        console.log('JSON object keys:', Object.keys(json));
        console.log('Preview:', JSON.stringify(json).slice(0, 200));
      }
    } catch {
      console.log('Non-JSON preview (len ' + text.length + '):', text.slice(0, 200));
    }
  } catch (e) {
    console.error('Fetch error:', e.message);
  }
}

async function run() {
  // First get a real PT search ID for Politeknik Negeri Lhokseumawe
  const sRes = await fetch(`${BASE_URL}/api/pencarian/pt/Politeknik%20Negeri%20Lhokseumawe`, { headers: HEADERS });
  const sJson = await sRes.json();
  const pt = sJson.data[0];
  console.log('Testing with PT:', pt.nama, 'Kode:', pt.kode, 'SearchID:', pt.id.slice(0, 20));

  await sleep(1000);

  // 1. Probe /api/pt/mahasiswa/:id
  await testEndpoint('GET /api/pt/mahasiswa/:id', `${BASE_URL}/api/pt/mahasiswa/${pt.id}`);
  await sleep(1000);

  // 2. Probe /api/pt/mahasiswa/ with query params
  await testEndpoint('GET /api/pt/mahasiswa?id_pt=...', `${BASE_URL}/api/pt/mahasiswa?id_pt=${pt.id}`);
  await sleep(1000);

  // 3. Probe student search with college scoping parameters
  // E.g. what if keyword is combined with NIM prefix or prodi?
  // Let's test searching for a specific NIM prefix for Politeknik Negeri Lhokseumawe
  // In PNL, NIMs often start with years, e.g. "20", "21", "22", "23", "24" or department codes
  await testEndpoint('Pencarian MHS dengan NIM "2023"', `${BASE_URL}/api/pencarian/mhs/2023`);
  await sleep(1000);

  // 4. Test searching combined: "Politeknik Negeri Lhokseumawe 2023"
  await testEndpoint('Pencarian MHS kombinasi: "Politeknik Negeri Lhokseumawe 2023"', `${BASE_URL}/api/pencarian/mhs/Politeknik%20Negeri%20Lhokseumawe%202023`);
  await sleep(1000);

  // 5. Test searching with single student NIM: e.g. "04027342"
  await testEndpoint('Pencarian MHS spesifik NIM "04027342"', `${BASE_URL}/api/pencarian/mhs/04027342`);
  await sleep(1000);

  // 6. Test /api/mahasiswa/nim or /api/detail-mahasiswa/nim
  await testEndpoint('POST /api/mahasiswa/nim', `${BASE_URL}/api/mahasiswa/nim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nim: '04027342' })
  });
}

run().catch(console.error);
