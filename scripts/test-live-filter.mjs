import fs from 'fs';

const acehInstitutions = JSON.parse(fs.readFileSync('lib/data/aceh-institutions.json', 'utf8'));

function normalizeCampusName(name) {
  if (!name) return '';
  return name.toUpperCase().replace(/\s+/g, ' ').replace(/[^A-Z0-9 ]/g, '').trim();
}

function expandAcronyms(str) {
  if (!str) return '';
  let s = ' ' + normalizeCampusName(str) + ' ';
  const map = [
    [/\bSTIKES\b/g, 'SEKOLAH TINGGI ILMU KESEHATAN'],
    [/\bSTIM\b/g, 'SEKOLAH TINGGI ILMU MANAJEMEN'],
    [/\bSTKIP\b/g, 'SEKOLAH TINGGI KEGURUAN DAN ILMU PENDIDIKAN'],
    [/\bSTAI\b/g, 'SEKOLAH TINGGI AGAMA ISLAM'],
    [/\bSTAIN\b/g, 'SEKOLAH TINGGI AGAMA ISLAM NEGERI'],
    [/\bIAI\b/g, 'INSTITUT AGAMA ISLAM'],
    [/\bIAIN\b/g, 'INSTITUT AGAMA ISLAM NEGERI'],
    [/\bUIN\b/g, 'UNIVERSITAS ISLAM NEGERI'],
    [/\bUNIV\b/g, 'UNIVERSITAS'],
    [/\bPOLTEK\b/g, 'POLITEKNIK'],
    [/\bAKBID\b/g, 'AKADEMI KEBIDANAN'],
    [/\bAKPER\b/g, 'AKADEMI KEPERAWATAN'],
    [/\bAKFAR\b/g, 'AKADEMI FARMASI'],
    [/\bPOLTEKKES\b/g, 'POLITEKNIK KESEHATAN'],
  ];
  for (const [rgx, rep] of map) {
    s = s.replace(rgx, rep);
  }
  return normalizeCampusName(s);
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
const acehExpandedMap = new Map();

const acehList = acehInstitutions.map((inst) => {
  const normNama = normalizeCampusName(inst.nama);
  const expNama = expandAcronyms(inst.nama);
  const normSingkat = inst.nama_singkat ? normalizeCampusName(inst.nama_singkat) : '';
  const expSingkat = inst.nama_singkat ? expandAcronyms(inst.nama_singkat) : '';

  if (normNama) acehNormMap.set(normNama, inst);
  if (normSingkat) acehNormMap.set(normSingkat, inst);
  if (expNama) acehExpandedMap.set(expNama, inst);
  if (expSingkat) acehExpandedMap.set(expSingkat, inst);

  return {
    ...inst,
    normNama,
    expNama,
    normSingkat,
    expSingkat,
  };
});

function findAcehInstitution(namaPt, sinkatanPt) {
  const normPt = normalizeCampusName(namaPt);
  const expPt = expandAcronyms(namaPt);
  const normSingkat = normalizeCampusName(sinkatanPt);
  const expSingkat = expandAcronyms(sinkatanPt);

  if (normPt && acehNormMap.has(normPt)) return acehNormMap.get(normPt);
  if (expPt && acehExpandedMap.has(expPt)) return acehExpandedMap.get(expPt);
  if (normSingkat && acehNormMap.has(normSingkat)) return acehNormMap.get(normSingkat);
  if (expSingkat && acehExpandedMap.has(expSingkat)) return acehExpandedMap.get(expSingkat);

  for (const inst of acehList) {
    if (inst.normNama && normPt && (normPt.includes(inst.normNama) || inst.normNama.includes(normPt))) {
      return inst;
    }
    if (inst.expNama && expPt && (expPt.includes(inst.expNama) || inst.expNama.includes(expPt))) {
      return inst;
    }
  }

  return null;
}

const GATEWAYS = [
  {
    name: 'pddikti.rone.dev',
    getUrl: (kw) => `https://pddikti.rone.dev/api/search/mhs/${encodeURIComponent(kw)}/`,
    headers: { 'Accept': 'application/json' },
  },
  {
    name: 'pddikti.fastapicloud.dev',
    getUrl: (kw) => `https://pddikti.fastapicloud.dev/api/search/mhs/${encodeURIComponent(kw)}/`,
    headers: { 'Accept': 'application/json' },
  },
  {
    name: 'pddikti.kemdiktisaintek.go.id',
    getUrl: (kw) => `https://pddikti.kemdiktisaintek.go.id/api/pencarian/mhs/${encodeURIComponent(kw)}`,
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://pddikti.kemdiktisaintek.go.id/',
    },
  },
];

async function fetchFromGateways(keyword) {
  for (const gw of GATEWAYS) {
    const url = gw.getUrl(keyword);
    console.log(`[Coba Gateway] ${gw.name} -> ${url}`);
    try {
      const res = await fetch(url, { headers: gw.headers });
      if (!res.ok) {
        console.log(`   ${gw.name} Status: HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      const rawList = Array.isArray(json) ? json : (json.data || json.mahasiswa || []);
      console.log(`   ${gw.name} BERHASIL (HTTP 200) -> Menerima ${rawList.length} data mahasiswa.`);
      return { gateway: gw.name, data: rawList };
    } catch (e) {
      console.log(`   ${gw.name} Error: ${e.message}`);
    }
  }
  return { gateway: 'None', data: [] };
}

async function main() {
  console.log('====================================================');
  console.log('PENGUJIAN BERJENJANG GATEWAY PDDIKTI & FILTER ACEH');
  console.log('====================================================\n');

  const testKeywords = ['Teuku', 'Cut', '217410101005'];

  for (const kw of testKeywords) {
    console.log(`\n=== Pengujian Kata Kunci: "${kw}" ===`);
    const { gateway, data } = await fetchFromGateways(kw);
    console.log(`Gateway yang berhasil: ${gateway}`);
    console.log(`Total mentah dari gateway: ${data.length}`);

    const acehMatches = [];
    const nonAcehRejected = [];

    for (const item of data) {
      const nama = item.nama || item.nama_mahasiswa || '';
      const nim = item.nim || item.nomor_induk || '';
      const namaPt = item.nama_pt || item.namapt || item.pt || '';
      const singkatanPt = item.sinkatan_pt || item.singkatan_pt || item.singkatan || '';
      const prodi = item.nama_prodi || item.namaprodi || item.prodi || '-';

      const match = findAcehInstitution(namaPt, singkatanPt);
      if (match) {
        acehMatches.push({
          nim,
          nama,
          nama_pt: match.nama,
          kode_pt: match.kode_pt,
          prodi,
          tahun_masuk: inferTahunMasuk(nim),
        });
      } else {
        nonAcehRejected.push(namaPt);
      }
    }

    console.log(`Total mahasiswa perguruan tinggi Aceh yang lolos: ${acehMatches.length}`);
    if (acehMatches.length > 0) {
      console.log('Sampel hasil diterima (3 teratas):');
      acehMatches.slice(0, 3).forEach((s, idx) => {
        console.log(`  [${idx + 1}] NIM: ${s.nim} | Nama: ${s.nama} | Kampus: ${s.nama_pt} (${s.kode_pt}) | Prodi: ${s.prodi}`);
      });
    }
    if (nonAcehRejected.length > 0) {
      console.log(`Total disaring keluar (luar Aceh): ${nonAcehRejected.length}. Sampel: ${nonAcehRejected.slice(0, 2).join(', ')}`);
    }
  }

  console.log('\n====================================================');
  console.log('PENGUJIAN BERHASIL SELESAI');
  console.log('====================================================');
}

main();
