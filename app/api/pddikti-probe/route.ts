import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE_URL = 'https://pddikti.kemdiktisaintek.go.id';

export async function GET() {
  const results: Record<string, unknown> = {};

  // 0. Check outgoing IP of this Vercel function
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json');
    results.ip = await ipRes.json();
  } catch (e) {
    results.ipError = e instanceof Error ? e.message : String(e);
  }

  // 1. Standard HEADERS
  try {
    const r1 = await fetch(`${BASE_URL}/api/pencarian/mhs/citra`, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': `${BASE_URL}/`,
        'Origin': BASE_URL,
      },
    });
    const text1 = await r1.text();
    results.test1_standard = {
      status: r1.status,
      headers: Object.fromEntries(r1.headers.entries()),
      bodyPreview: text1.slice(0, 300),
    };
  } catch (e) {
    results.test1_error = e instanceof Error ? e.message : String(e);
  }

  // 2. Only Referer, NO Origin
  try {
    const r2 = await fetch(`${BASE_URL}/api/pencarian/mhs/citra`, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': `${BASE_URL}/`,
      },
    });
    const text2 = await r2.text();
    results.test2_no_origin = {
      status: r2.status,
      headers: Object.fromEntries(r2.headers.entries()),
      bodyPreview: text2.slice(0, 300),
    };
  } catch (e) {
    results.test2_error = e instanceof Error ? e.message : String(e);
  }

  // 3. Plain fetch, minimal headers
  try {
    const r3 = await fetch(`${BASE_URL}/api/pencarian/mhs/citra`, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });
    const text3 = await r3.text();
    results.test3_minimal = {
      status: r3.status,
      headers: Object.fromEntries(r3.headers.entries()),
      bodyPreview: text3.slice(0, 300),
    };
  } catch (e) {
    results.test3_error = e instanceof Error ? e.message : String(e);
  }

  // 4. Test PT search endpoint
  try {
    const r4 = await fetch(`${BASE_URL}/api/pencarian/pt/syiah%20kuala`, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': `${BASE_URL}/`,
        'Origin': BASE_URL,
      },
    });
    const text4 = await r4.text();
    results.test4_pt_search = {
      status: r4.status,
      headers: Object.fromEntries(r4.headers.entries()),
      bodyPreview: text4.slice(0, 300),
    };
  } catch (e) {
    results.test4_error = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(results);
}
