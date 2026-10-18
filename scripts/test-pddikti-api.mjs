/**
 * Diagnostic script to test PDDikti API endpoints safely and observe response behaviors.
 * 
 * Rules:
 * - Limited requests with polite delay
 * - Mask student PII in output
 * - Check response structure, headers, pagination hints, and ID stability
 */

const BASE_URL = 'https://pddikti.kemdiktisaintek.go.id';

const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://pddikti.kemdiktisaintek.go.id/',
};

function maskPII(str) {
  if (!str || typeof str !== 'string') return str;
  if (str.length <= 4) return '***';
  return str.slice(0, 2) + '*'.repeat(Math.max(1, str.length - 4)) + str.slice(-2);
}

function sanitizeItem(item) {
  if (!item || typeof item !== 'object') return item;
  const sanitized = { ...item };
  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('nama') || lowerKey.includes('nim') || lowerKey.includes('nik') || lowerKey.includes('tgl') || lowerKey.includes('lahir')) {
      sanitized[key] = maskPII(String(sanitized[key]));
    }
  }
  return sanitized;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  console.log(`\n[REQUEST] ${options.method || 'GET'} ${url}`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...HEADERS,
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    console.log(`[RESPONSE] Status: ${response.status} ${response.statusText}`);
    console.log(`[RESPONSE] Content-Type: ${response.headers.get('content-type')}`);
    
    const rawText = await response.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.log(`[RESPONSE] Non-JSON payload (length: ${rawText.length}):`, rawText.slice(0, 300));
      return { status: response.status, isJson: false, raw: rawText.slice(0, 500) };
    }

    return { status: response.status, isJson: true, data };
  } catch (err) {
    console.error(`[ERROR] Request failed: ${err.message}`);
    return { error: err.message };
  }
}

async function runDiagnostics() {
  console.log('====================================================');
  console.log('DIAGNOSTIK KELAYAKAN API PDDIKTI');
  console.log('Base URL:', BASE_URL);
  console.log('Waktu mulai:', new Date().toISOString());
  console.log('====================================================');

  const report = {
    ptSearch: null,
    mhsSearchRun1: null,
    mhsSearchRun2: null,
    idStability: null,
    paginationHints: [],
    mhsDetail: null,
  };

  // 1. Test PT Search (Perguruan Tinggi)
  console.log('\n--- 1. Uji Endpoint Pencarian PT ---');
  const ptRes = await fetchJson('/api/pencarian/pt/Politeknik%20Negeri%20Lhokseumawe');
  if (ptRes.data) {
    const list = Array.isArray(ptRes.data) ? ptRes.data : (ptRes.data.data || []);
    console.log(`Struktur respons PT: listLength=${list.length}, rootKeys=${Object.keys(ptRes.data).join(', ')}`);
    if (list.length > 0) {
      console.log('Keys objek PT:', Object.keys(list[0]));
      console.log('Sampel data PT:', JSON.stringify(list[0], null, 2));
    }
    report.ptSearch = { status: ptRes.status, count: list.length, sampleKeys: list.length > 0 ? Object.keys(list[0]) : null };
  }

  await sleep(1500);

  // 2. Test MHS Search (Mahasiswa) Run 1
  // We test both keyword "Politeknik Negeri Lhokseumawe" and a common name like "Cut" or "Muhammad"
  console.log('\n--- 2. Uji Endpoint Pencarian Mahasiswa (Permintaan 1: keyword PT) ---');
  const mhsRes1 = await fetchJson('/api/pencarian/mhs/Politeknik%20Negeri%20Lhokseumawe');
  let firstItemRun1 = null;
  if (mhsRes1.data) {
    const list = Array.isArray(mhsRes1.data) ? mhsRes1.data : (mhsRes1.data.data || []);
    console.log(`Struktur respons MHS Run 1: listLength=${list.length}, rootKeys=${Object.keys(mhsRes1.data).join(', ')}`);
    if (list.length > 0) {
      firstItemRun1 = list[0];
      console.log('Keys objek MHS:', Object.keys(firstItemRun1));
      console.log('Sampel data MHS pertama (PII disamarkan):', JSON.stringify(sanitizeItem(firstItemRun1), null, 2));
      console.log(`Sampel ID Run 1 [0]: ${firstItemRun1.id || firstItemRun1.id_mhs || '(tidak ada id)'}`);
    }
    report.mhsSearchRun1 = { status: mhsRes1.status, count: list.length };
  }

  await sleep(2000);

  // 3. Test MHS Search Run 2 (Same query) to compare ID stability
  console.log('\n--- 3. Uji Endpoint Pencarian Mahasiswa (Permintaan 2: keyword PT - Cek ID) ---');
  const mhsRes2 = await fetchJson('/api/pencarian/mhs/Politeknik%20Negeri%20Lhokseumawe');
  let firstItemRun2 = null;
  if (mhsRes2.data) {
    const list2 = Array.isArray(mhsRes2.data) ? mhsRes2.data : (mhsRes2.data.data || []);
    console.log(`Hasil Run 2 Count: ${list2.length}`);
    if (list2.length > 0) {
      firstItemRun2 = list2[0];
      const id1 = firstItemRun1?.id;
      const id2 = firstItemRun2?.id;
      const idChanged = id1 !== id2;

      console.log(`ID Run 1: ${id1}`);
      console.log(`ID Run 2: ${id2}`);
      console.log(`Apakah ID berubah antara dua permintaan identik? ${idChanged ? 'YA (ID DINAMIS / EPHEMERAL / ENCRYPTED)' : 'TIDAK (ID STABIL)'}`);

      // Also compare other fields
      console.log(`Apakah NIM sama? ${firstItemRun1?.nim === firstItemRun2?.nim ? 'YA' : 'TIDAK'}`);
      console.log(`Apakah Nama sama? ${firstItemRun1?.nama === firstItemRun2?.nama ? 'YA' : 'TIDAK'}`);

      report.idStability = {
        id1: id1 ? id1.slice(0, 15) + '...' : null,
        id2: id2 ? id2.slice(0, 15) + '...' : null,
        isEphemeral: idChanged,
        nimIdentical: firstItemRun1?.nim === firstItemRun2?.nim,
      };
    }
  }

  // 4. Test MHS Search with Name/NIM keyword
  await sleep(1500);
  console.log('\n--- 4. Uji Endpoint Pencarian Mahasiswa (Nama Orang: "Teuku") ---');
  const mhsResTeuku = await fetchJson('/api/pencarian/mhs/Teuku');
  if (mhsResTeuku.data) {
    const listTeuku = Array.isArray(mhsResTeuku.data) ? mhsResTeuku.data : (mhsResTeuku.data.data || []);
    console.log(`Jumlah hasil pencarian nama "Teuku": ${listTeuku.length}`);
    if (listTeuku.length > 0) {
      console.log('Sampel 1 mahasiswa "Teuku":', JSON.stringify(sanitizeItem(listTeuku[0]), null, 2));
    }
  }

  // 5. Pengecekan Mekanisme Pagination
  console.log('\n--- 5. Pengecekan Mekanisme Pagination ---');
  const checkPagination = (res) => {
    if (!res || !res.data) return 'No data';
    const keys = Object.keys(res.data);
    return `Root wrapper keys: [${keys.join(', ')}]. Ada metadata pagination (page/limit/total/cursor)? ${keys.some(k => /page|total|limit|offset|cursor/i.test(k)) ? 'YA' : 'TIDAK (Hanya status dan data array)'}`;
  };
  console.log('Pemeriksaan pagination PT:', checkPagination(ptRes));
  console.log('Pemeriksaan pagination MHS:', checkPagination(mhsRes1));
  report.paginationHints.push(checkPagination(mhsRes1));

  // 6. Test Query Param variations (?page=2, ?limit=10, /page/2)
  console.log('\n--- 6. Uji Parameter / Variasi Pagination ---');
  const testParams = ['?page=2', '?offset=10', '?limit=200'];
  for (const param of testParams) {
    await sleep(1000);
    const testRes = await fetchJson(`/api/pencarian/mhs/Politeknik%20Negeri%20Lhokseumawe${param}`);
    const list = Array.isArray(testRes.data) ? testRes.data : (testRes.data?.data || []);
    console.log(`Param "${param}" -> status: ${testRes.status}, count: ${list.length}`);
    if (firstItemRun1 && list.length > 0) {
      const isIdenticalToFirst = (list[0].nama === firstItemRun1.nama && list[0].nim === firstItemRun1.nim);
      console.log(`   Apakah item pertama sama persis dengan query default? ${isIdenticalToFirst ? 'YA (Parameter diabaikan server)' : 'TIDAK'}`);
    }
  }

  await sleep(1500);

  // 7. Test Detail Endpoint (POST /api/detail/mhs)
  console.log('\n--- 7. Uji Endpoint Detail Mahasiswa (POST /api/detail/mhs) ---');
  let testId = firstItemRun2?.id || firstItemRun1?.id;
  if (testId) {
    console.log(`Menguji detail dengan ID: ${testId.slice(0, 20)}... (panjang ${testId.length})`);
    const detailRes = await fetchJson('/api/detail/mhs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': `${BASE_URL}/detail-mhs/${testId}`,
        'Origin': BASE_URL,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
      body: JSON.stringify({ id: testId }),
    });

    if (detailRes.data) {
      const detailPayload = detailRes.data.data || detailRes.data;
      console.log('Struktur respons Detail:', typeof detailPayload, Array.isArray(detailPayload) ? `Array length ${detailPayload.length}` : 'Object');
      const sample = Array.isArray(detailPayload) ? detailPayload[0] : detailPayload;
      if (sample && typeof sample === 'object') {
        console.log('Field yang tersedia di detail:', Object.keys(sample));
        console.log('Sampel data detail (PII disamarkan):', JSON.stringify(sanitizeItem(sample), null, 2));
        report.mhsDetail = {
          status: detailRes.status,
          availableFields: Object.keys(sample),
          sampleFieldTypes: Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, typeof v])),
        };
      }
    } else {
      console.log('Detail response error:', detailRes);
      report.mhsDetail = { status: detailRes.status, error: detailRes.error || 'Failed' };
    }
  } else {
    console.log('Tidak ada ID valid untuk menguji detail.');
  }

  console.log('\n====================================================');
  console.log('RINGKASAN DIAGNOSTIK');
  console.log('====================================================');
  console.log(JSON.stringify(report, null, 2));
  console.log('====================================================\n');
}

runDiagnostics().catch(console.error);
