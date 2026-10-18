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

async function searchLive(keyword) {
  const url = `${BASE_URL}/api/pencarian/mhs/${encodeURIComponent(keyword)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  const rawList = json.data || json || [];
  
  const filtered = [];
  const nonAcehCount = [];

  for (const item of rawList) {
    const matched = findAcehInstitution(item.nama_pt, item.sinkatan_pt);
    if (matched) {
      filtered.push({
        nim: item.nim,
        nama: item.nama,
        prodi: item.nama_prodi,
        nama_pt: matched.nama,
        kode_pt: matched.kode_pt,
        tahun_masuk: inferTahunMasuk(item.nim),
      });
    } else {
      nonAcehCount.push(item.nama_pt);
    }
  }

  return {
    keyword,
    rawTotal: rawList.length,
    acehTotal: filtered.length,
    sampleAceh: filtered.slice(0, 3),
    sampleNonAcehRejected: nonAcehCount.slice(0, 3),
  };
}

async function main() {
  console.log('Testing live PDDikti query & strict Aceh filtering:');
  const queries = ['Muhammad', 'Teuku', 'Cut', '217410101005'];

  for (const q of queries) {
    console.log(`\n=== Keyword: "${q}" ===`);
    try {
      const res = await searchLive(q);
      console.log(`Total dari API PDDikti: ${res.rawTotal}`);
      console.log(`Total setelah filter kampus Aceh: ${res.acehTotal}`);
      if (res.sampleAceh.length > 0) {
        console.log('Sampel hasil diterima (Aceh):');
        res.sampleAceh.forEach((s, idx) => {
          console.log(`  [${idx + 1}] NIM: ${s.nim} | Nama: ${s.nama} | Kampus: ${s.nama_pt} (${s.kode_pt}) | Prodi: ${s.prodi} | Thn: ${s.tahun_masuk}`);
        });
      }
      if (res.sampleNonAcehRejected.length > 0) {
        console.log('Sampel kampus luar Aceh yang berhasil difilter (ditolak):', res.sampleNonAcehRejected.join(', '));
      }
    } catch (e) {
      console.error('Error:', e.message);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

main();
