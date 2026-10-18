<?php
/**
 * Direktori Mahasiswa Aceh - Upstream PDDikti Proxy Script (PHP cURL)
 * 
 * CARA MENGGUNAKAN:
 * 1. Unggah file ini ke hosting / cPanel / VPS yang berlokasi di Indonesia (IP Indonesia).
 * 2. Catat URL file ini, misalnya: https://domain-anda.com/pddikti-proxy.php?endpoint={endpoint}
 * 3. Buka Dashboard Vercel -> Project Settings -> Environment Variables.
 * 4. Tambahkan variable:
 *    PDDIKTI_PROXY_URL = "https://domain-anda.com/pddikti-proxy.php?endpoint={endpoint}"
 *    PDDIKTI_PROXY_KEY = "rahasia-opsional-anda" (opsional)
 * 5. Redeploy aplikasi Vercel.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, x-proxy-key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Validasi security key jika PDDIKTI_PROXY_KEY dikonfigurasi
$expectedKey = getenv('PDDIKTI_PROXY_KEY') ?: '';
if (!empty($expectedKey)) {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['HTTP_X_PROXY_KEY'] ?? '';
    if (strpos($authHeader, $expectedKey) === false) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Unauthorized proxy request']);
        exit;
    }
}

// Ambil parameter endpoint tujuan
$endpoint = $_GET['endpoint'] ?? $_GET['url'] ?? '';
if (empty($endpoint)) {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'Parameter endpoint wajib diisi. Contoh: ?endpoint=api/pencarian/mhs/nama'
    ]);
    exit;
}

$endpoint = '/' . ltrim($endpoint, '/');
$targetUrl = 'https://pddikti.kemdiktisaintek.go.id' . $endpoint;

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 12);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Accept: application/json, text/plain, */*',
    'Accept-Language: id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer: https://pddikti.kemdiktisaintek.go.id/',
    'Origin: https://pddikti.kemdiktisaintek.go.id',
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    echo json_encode(['status' => 'error', 'message' => 'Curl error: ' . $curlErr]);
    exit;
}

http_response_code($httpCode);
echo $response;
