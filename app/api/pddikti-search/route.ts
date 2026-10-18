export const runtime = 'edge';

const PDDIKTI_BASE = 'https://pddikti.kemdiktisaintek.go.id';

const ACEH_KEYWORDS = [
  'aceh', 'syiah kuala', 'malikussaleh', 'teungku', 'tgk', 'dayah',
  'iskandar muda', 'al-washliyah', 'al washliyah', 'langsa', 'lhokseumawe',
  'sabang', 'meulaboh', 'bireuen', 'takengon', 'sigli', 'calang', 'sinabang',
  'tapaktuan', 'singkil', 'blangpidie', 'kualasimpang', 'idi', 'meureudu',
  'peureulak', 'samalanga', 'beutong', 'jeuram', 'blangkejeren', 'kutacane',
  'jantho', 'abdya', 'gayo', 'simeulue', 'pidie', 'bener meriah',
];

function isAcehCampus(namaPt: string): boolean {
  if (!namaPt) return false;
  const lower = namaPt.toLowerCase();
  return ACEH_KEYWORDS.some((kw) => lower.includes(kw));
}

interface RawItem {
  id?: string;
  nama?: string;
  nim?: string;
  nama_pt?: string;
  sinkatan_pt?: string;
  singkatan_pt?: string;
  nama_prodi?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('q') || '';
  const filterAceh = searchParams.get('filter_aceh') !== 'false';

  if (!keyword.trim()) {
    return Response.json(
      { status: 'error', message: 'Parameter pencarian (q) tidak boleh kosong.', data: [] },
      { status: 400 }
    );
  }

  const encoded = encodeURIComponent(keyword.trim());
  const endpoint = `/api/pencarian/mhs/${encoded}`;
  const proxyUrl = process.env.PDDIKTI_PROXY_URL?.trim();
  const targetUrl = proxyUrl
    ? proxyUrl.includes('{endpoint}')
      ? proxyUrl.replace('{endpoint}', endpoint.replace(/^\//, ''))
      : `${proxyUrl.replace(/\/+$/, '')}${endpoint}`
    : `${PDDIKTI_BASE}${endpoint}`;

  const mode = searchParams.get('mode') || 'default';
  let headers: Record<string, string> = {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };

  if (process.env.PDDIKTI_PROXY_KEY) {
    headers['x-proxy-key'] = process.env.PDDIKTI_PROXY_KEY;
  }

  if (mode === 'default') {
    headers = {
      ...headers,
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': PDDIKTI_BASE + '/',
      'Origin': PDDIKTI_BASE,
      'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    };
  } else if (mode === 'referer-only') {
    headers['Referer'] = PDDIKTI_BASE + '/';
  }

  try {
    const res = await fetch(targetUrl, {
      headers,
    });

    const resText = await res.text();
    const resHeaders = Object.fromEntries(res.headers.entries());

    if (!res.ok) {
      const statusCode = res.status;
      return Response.json({
        status: 'error',
        statusCode,
        message: `API PDDikti merespons HTTP ${statusCode}`,
        pddiktiHeaders: resHeaders,
        pddiktiBodyPreview: resText.slice(0, 1000),
        data: [],
      }, { status: 200 });
    }

    let json: any;
    try {
      json = JSON.parse(resText);
    } catch {
      return Response.json({
        status: 'error',
        message: 'Respons PDDikti bukan JSON yang valid',
        pddiktiBodyPreview: resText.slice(0, 500),
        data: [],
      });
    }
    const rawList: RawItem[] = json?.data ?? json ?? [];
    const filtered = filterAceh ? rawList.filter((item) => isAcehCampus(item.nama_pt || '')) : rawList;
    const isCapped = rawList.length >= 100;

    return Response.json({
      status: 'success',
      data: filtered,
      totalRaw: rawList.length,
      totalAceh: filtered.length,
      isCapped,
      message: isCapped
        ? 'API PDDikti membatasi hasil pada 100 data per pencarian. Gunakan kata kunci lebih spesifik.'
        : undefined,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? 'Gagal menghubungi API PDDikti: ' + err.message
        : 'Kegagalan komunikasi dengan server PDDikti.';
    return Response.json({ status: 'error', message, data: [] });
  }
}