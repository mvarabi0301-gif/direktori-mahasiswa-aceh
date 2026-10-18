/**
 * Test if detail endpoint requires cookies / session headers / specific origin
 */

const BASE_URL = 'https://pddikti.kemdiktisaintek.go.id';

async function testDetailEndpoint() {
  console.log('Testing detail endpoint with session / headers...');
  
  // 1. Visit homepage or search page first to collect cookies
  const homeRes = await fetch(`${BASE_URL}/`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    }
  });

  const rawCookies = homeRes.headers.getSetCookie ? homeRes.headers.getSetCookie() : [homeRes.headers.get('set-cookie')].filter(Boolean);
  const cookieHeader = rawCookies.map(c => c.split(';')[0]).join('; ');
  console.log('Got cookies from homepage:', cookieHeader || '(none)');

  // 2. Perform search
  const searchRes = await fetch(`${BASE_URL}/api/pencarian/mhs/Politeknik%20Negeri%20Lhokseumawe`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': `${BASE_URL}/`,
      'Origin': BASE_URL,
      'Cookie': cookieHeader,
    }
  });

  const searchCookies = searchRes.headers.getSetCookie ? searchRes.headers.getSetCookie() : [searchRes.headers.get('set-cookie')].filter(Boolean);
  const allCookies = [...rawCookies, ...searchCookies].map(c => c ? c.split(';')[0] : '').filter(Boolean).join('; ');
  
  const searchJson = await searchRes.json();
  const list = searchJson?.data || [];
  if (list.length === 0) {
    console.log('Search returned no data');
    return;
  }

  const id = list[0].id;
  console.log(`Found candidate ID: ${id.slice(0, 25)}...`);

  // 3. Test POST /api/detail/mhs with full browser headers & cookies
  const detailRes = await fetch(`${BASE_URL}/api/detail/mhs`, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'Referer': `${BASE_URL}/detail-mhs/${id}`,
      'Origin': BASE_URL,
      'Cookie': allCookies,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    },
    body: JSON.stringify({ id }),
  });

  console.log('Detail response status:', detailRes.status, detailRes.statusText);
  const json = await detailRes.json();
  if (json.data) {
    console.log('Detail keys:', Object.keys(json.data));
    const sanitized = {};
    for (const [k, v] of Object.entries(json.data)) {
      if (/nama|nim|nik|tgl|lahir/i.test(k)) {
        sanitized[k] = typeof v === 'string' && v.length > 4 ? v.slice(0, 2) + '***' + v.slice(-2) : '***';
      } else {
        sanitized[k] = v;
      }
    }
    console.log('Sanitized detail data:', JSON.stringify(sanitized, null, 2));
  } else {
    console.log('Detail body:', json);
  }
}

testDetailEndpoint().catch(console.error);
