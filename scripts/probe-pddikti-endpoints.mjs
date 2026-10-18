const BASE_URL = 'https://pddikti.kemdiktisaintek.go.id';

const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': `${BASE_URL}/`,
  'Origin': BASE_URL,
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function probe(method, path, body = null) {
  const url = `${BASE_URL}${path}`;
  console.log(`\n[PROBE] ${method} ${url}`);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...HEADERS,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    console.log(`Status: ${res.status} ${res.statusText}`);
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
      console.log('JSON Keys:', Object.keys(json));
      if (Array.isArray(json)) {
        console.log(`Array length: ${json.length}`);
        console.log('Sample item [0]:', JSON.stringify(json[0]).slice(0, 200));
      } else if (json.data) {
        if (Array.isArray(json.data)) {
          console.log(`json.data is Array length: ${json.data.length}`);
          console.log('Sample data[0]:', JSON.stringify(json.data[0]).slice(0, 200));
        } else {
          console.log('json.data Keys:', Object.keys(json.data));
          console.log('Sample json.data:', JSON.stringify(json.data).slice(0, 200));
        }
      } else {
        console.log('Raw JSON preview:', JSON.stringify(json).slice(0, 300));
      }
    } catch {
      console.log('Non-JSON preview (len ' + text.length + '):', text.slice(0, 200));
    }
  } catch (err) {
    console.error('Error probing:', err.message);
  }
}

async function runProbes() {
  // 1. PT Locations / Peta
  await probe('GET', '/api/pt/locations');
  await sleep(1000);
  await probe('GET', '/api/pt/peta');
  await sleep(1000);

  // 2. v2 pt search filter (both GET and POST with bodies)
  await probe('GET', '/api/v2/pt/search/filter?limit=10');
  await sleep(1000);
  await probe('POST', '/api/v2/pt/search/filter?limit=10', { provinsi: 'Aceh' });
  await sleep(1000);
  await probe('POST', '/api/v2/pt/search/filter?limit=10', { id_provinsi: '11', provinsi_pt: 'Aceh' });
  await sleep(1000);

  // 3. PT search with keyword "Aceh"
  await probe('GET', '/api/pencarian/pt/Aceh');
  await sleep(1000);

  // 4. Enc all search
  await probe('GET', '/api/pencarian/enc/all/Aceh');
  await sleep(1000);
}

runProbes().catch(console.error);
