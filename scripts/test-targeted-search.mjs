import fs from 'fs';

const BASE_URL = 'https://pddikti.kemdiktisaintek.go.id';

const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': `${BASE_URL}/`,
  'Origin': BASE_URL,
};

const acehInstitutions = JSON.parse(fs.readFileSync('lib/data/aceh-institutions.json', 'utf8'));

function cleanString(str) {
  if (!str) return '';
  return str.trim();
}

function normalizeCampusName(name) {
  if (!name) return '';
  return name.toUpperCase().replace(/\s+/g, ' ').replace(/[^A-Z0-9 ]/g, '').trim();
}

function inferTahunMasuk(nim) {
  if (!nim) return null;
  const clean = nim.trim();
  if (/^(19\d{2}|20\d{2})/.test(clean)) {
    const y = parseInt(clean.slice(0, 4), 10);
    if (y >= 1980 && y <= 2030) return y;
  }
  if (/^\d{2}/.test(clean)) {
    const prefix = parseInt(clean.slice(0, 2), 10);
    if (prefix >= 80 && prefix <= 99) return 1900 + prefix;
    if (prefix >= 0 && prefix <= 35) return 2000 + prefix;
  }
  return null;
}

const acehNormMap = new Map();
const acehList = acehInstitutions.map((inst) => {
  const normNama = normalizeCampusName(inst.nama);
  const normSingkat = inst.nama_singkat ? normalizeCampusName(inst.nama_singkat) : '';
  if (normNama) acehNormMap.set(normNama, inst);
  if (normSingkat) acehNormMap.set(normSingkat, inst);
  return { ...inst, normNama, normSingkat };
});

function findAcehInstitution(namaPt, sinkatanPt) {
  const normPt = normalizeCampusName(namaPt);
  const normSingkat = normalizeCampusName(sinkatanPt);
  if (normPt && acehNormMap.has(normPt)) return acehNormMap.get(normPt);
  if (normSingkat && acehNormMap.has(normSingkat)) return acehNormMap.get(normSingkat);
  for (const inst of acehList) {
    if (inst.normNama && normPt) {
      if (normPt.includes(inst.normNama) || inst.normNama.includes(normPt)) return inst;
    }
  }
  return null;
}

function buildTargetedSearchQueries(query, campusName) {
  const cleanQ = cleanString(query);
  if (!cleanQ) return [];

  const isNimQuery = /^\d+$/.test(cleanQ);
  if (isNimQuery) {
    return [cleanQ];
  }

  if (campusName && campusName.trim() !== '') {
    const cleanCampus = campusName.trim();
    const queries = [cleanQ];
    const inst = findAcehInstitution(cleanCampus);
    if (!cleanQ.toLowerCase().includes(cleanCampus.toLowerCase())) {
      queries.push(`${cleanQ} ${cleanCampus}`);
    }
    if (inst?.nama_singkat && !cleanQ.toUpperCase().includes(inst.nama_singkat.toUpperCase())) {
      queries.push(`${cleanQ} ${inst.nama_singkat}`);
    }
    return Array.from(new Set(queries));
  }

  const lowerQ = cleanQ.toLowerCase();
  const variations = [cleanQ];
  const targets = ['Aceh', 'Syiah Kuala', 'Malikussaleh', 'Teuku Umar', 'Lhokseumawe'];
  for (const t of targets) {
    if (!lowerQ.includes(t.toLowerCase())) {
      variations.push(`${cleanQ} ${t}`);
    }
    if (variations.length >= 5) break;
  }
  return variations;
}

async function searchStudentsLive(params) {
  const query = cleanString(params.query);
  const campusName = cleanString(params.campusName);
  const searchQueries = buildTargetedSearchQueries(query, campusName);

  const rawResults = [];
  let anySuccess = false;
  let lastError;

  const batchSize = 2;
  for (let i = 0; i < searchQueries.length; i += batchSize) {
    const batch = searchQueries.slice(i, i + batchSize);
    const batchPromises = batch.map(async (kw) => {
      const url = `${BASE_URL}/api/pencarian/mhs/${encodeURIComponent(kw)}`;
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      const list = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
      return list;
    });

    const results = await Promise.allSettled(batchPromises);
    for (const r of results) {
      if (r.status === 'fulfilled') {
        anySuccess = true;
        rawResults.push(...r.value);
      } else {
        lastError = r.reason.message;
      }
    }
    if (i + batchSize < searchQueries.length) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  if (!anySuccess) {
    throw new Error(lastError || 'Gagal menghubungi PDDikti');
  }

  const normTargetPt = campusName ? normalizeCampusName(campusName) : '';
  const targetInst = campusName ? findAcehInstitution(campusName) : null;
  const normTargetSingkat = targetInst?.nama_singkat ? normalizeCampusName(targetInst.nama_singkat) : '';
  const filteredStudents = [];
  const seenNims = new Set();

  for (const item of rawResults) {
    const nim = cleanString(item.nim);
    const nama = cleanString(item.nama);
    const studentPt = cleanString(item.nama_pt);
    const studentSingkat = cleanString(item.sinkatan_pt || item.singkatan_pt);
    const prodi = cleanString(item.nama_prodi) || '-';

    if (!nim || !nama) continue;

    let matchedAcehInst = null;
    if (normTargetPt) {
      const normStudentPt = normalizeCampusName(studentPt);
      const normStudentSingkat = normalizeCampusName(studentSingkat);
      const matches = normStudentPt === normTargetPt || (normTargetSingkat && normStudentSingkat === normTargetSingkat);
      if (!matches) continue;
    } else {
      matchedAcehInst = findAcehInstitution(studentPt, studentSingkat);
      if (!matchedAcehInst) continue;
    }

    const dedupeKey = `${nim.toUpperCase()}-${studentPt.toUpperCase()}`;
    if (seenNims.has(dedupeKey)) continue;
    seenNims.add(dedupeKey);

    const kodePt = matchedAcehInst?.kode_pt || '000000';
    const namaPt = studentPt || matchedAcehInst?.nama || 'Perguruan Tinggi';

    filteredStudents.push({
      nim,
      nama,
      kode_pt: kodePt,
      nama_pt: namaPt,
      prodi,
      tahun_masuk: inferTahunMasuk(nim),
    });
  }

  return {
    query,
    queriesUsed: searchQueries,
    totalRaw: rawResults.length,
    totalAceh: filteredStudents.length,
    sample: filteredStudents.slice(0, 3),
  };
}

async function run() {
  console.log('====================================================');
  console.log('PENGUJIAN ALGORITMA PENCARIAN BERTARGET PDDIKTI');
  console.log('====================================================');

  const testCases = [
    { query: 'Muhammad' },
    { query: 'Teuku' },
    { query: 'Cut' },
    { query: 'Husnul Khalisha' },
    { query: '217410101005' },
    { query: 'Rahmat', campusName: 'Universitas Syiah Kuala' },
  ];

  for (const tc of testCases) {
    console.log(`\n--- Uji: query="${tc.query}" ${tc.campusName ? `(Kampus: ${tc.campusName})` : ''} ---`);
    try {
      const res = await searchStudentsLive(tc);
      console.log('Variasi query yang dikirim:', res.queriesUsed);
      console.log(`Total data mentah: ${res.totalRaw} | Mahasiswa Aceh unik: ${res.totalAceh}`);
      res.sample.forEach((s, idx) => {
        console.log(`  [${idx + 1}] ${s.nim} - ${s.nama} (${s.nama_pt} [${s.kode_pt}]) - ${s.prodi}`);
      });
    } catch (e) {
      console.error('Error:', e.message);
    }
  }
}

run();
