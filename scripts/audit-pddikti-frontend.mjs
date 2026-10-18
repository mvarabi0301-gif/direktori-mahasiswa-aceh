/**
 * Audit script: inspect PDDikti frontend HTML and JS bundles for API endpoints
 */

const BASE_URL = 'https://pddikti.kemdiktisaintek.go.id';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Referer': BASE_URL,
};

async function auditFrontend() {
  console.log('Fetching homepage HTML from', BASE_URL);
  const res = await fetch(BASE_URL, { headers: HEADERS });
  const html = await res.text();
  console.log('Homepage status:', res.status, 'HTML length:', html.length);

  // Extract script tags
  const scriptRegex = /<script[^>]+src="([^">]+)"/g;
  const scriptUrls = [];
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    scriptUrls.push(match[1]);
  }
  console.log('Found script URLs:', scriptUrls.length);

  // Filter Next.js chunks or app bundles
  const appScripts = scriptUrls.filter(s => s.includes('_next') || s.includes('chunk') || s.includes('app'));
  console.log('Candidate app scripts:', appScripts);

  const foundApiEndpoints = new Set();

  for (const sUrl of appScripts) {
    const fullUrl = sUrl.startsWith('http') ? sUrl : `${BASE_URL}${sUrl.startsWith('/') ? '' : '/'}${sUrl}`;
    try {
      console.log('Checking script:', fullUrl.slice(-50));
      const sRes = await fetch(fullUrl, { headers: HEADERS });
      if (!sRes.ok) continue;
      const jsText = await sRes.text();

      // Look for /api/... patterns
      const apiRegex = /\/api\/[a-zA-Z0-9_\-\/]+/g;
      let apiMatch;
      while ((apiMatch = apiRegex.exec(jsText)) !== null) {
        foundApiEndpoints.add(apiMatch[0]);
      }
    } catch (e) {
      console.warn('Error reading script', sUrl, e.message);
    }
  }

  console.log('\n--- ALL /api/ ENDPOINTS FOUND IN FRONTEND BUNDLES ---');
  const sorted = Array.from(foundApiEndpoints).sort();
  sorted.forEach(ep => console.log(' ', ep));
}

auditFrontend().catch(console.error);
