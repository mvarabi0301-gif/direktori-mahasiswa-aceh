# Laporan Diagnostik Kelayakan API PDDikti

**Tanggal Pengujian:** 18 Oktober 2026  
**Status Pengujian:** Selesai (Terverifikasi Empiris)  
**Base URL:** `https://pddikti.kemdiktisaintek.go.id`  

---

## 1. Ringkasan Eksekutif

Pengujian diagnostik terbatas telah dijalankan menggunakan script manual `scripts/test-pddikti-api.mjs`. Seluruh pengamatan dicatat berdasarkan respons nyata dari server PDDikti tanpa asumsi atau rekayasa data.

### Hasil Kunci:
1. **Endpoint Pencarian PT (`GET /api/pencarian/pt/{keyword}`)**: Berfungsi normal (HTTP 200). Mengembalikan metadata kampus termasuk kode PT, singkatan, dan nama resmi.
2. **Endpoint Pencarian Mahasiswa (`GET /api/pencarian/mhs/{keyword}`)**: Berfungsi normal (HTTP 200), namun memiliki **batasan keras (hard cap) maksimal 100 data per permintaan**.
3. **Ketiadaan Mekanisme Pagination**: Respons API tidak menyediakan metadata pagination (`page`, `total`, `limit`, dsb.). Pengujian variasi query parameter (`?page=2`, `?offset=10`, `?limit=200`) membuktikan server mengabaikan parameter tersebut dan tetap mengembalikan 100 data yang sama dari indeks awal.
4. **ID Mahasiswa Bersifat Efemeral / Dinamis**: Nilai field `id` pada respons pencarian berubah di setiap pemanggilan (terenkripsi dinamis per sesi/permintaan). **ID PDDikti TIDAK BISA digunakan sebagai Primary Key atau Foreign Key permanen**.
5. **Kunci Unik Mahasiswa**: Kombinasi `kode_pt` (atau `nama_pt`) dan `nim` (setelah di-`trim()`) terbukti konsisten dan menjadi satu-satunya kandidat **Composite Unique Key** yang valid untuk database.
6. **Endpoint Detail Mahasiswa (`POST /api/detail/mhs`)**: Membutuhkan header `Referer` dan `Origin` dari domain PDDikti. Berhasil mengembalikan detail lengkap (kode_pt, kode_prodi, prodi, status_saat_ini, jenjang, tanggal_masuk).
7. **Keputusan Sinkronisasi Massal Sesuai Aturan**: Sesuai arahan Bagian C dan F aturan proyek, karena endpoint hanya mengembalikan hasil terbatas (maksimal 100) dan tidak memiliki pagination terkonfirmasi, **sinkronisasi massal seluruh kampus/seluruh Aceh TIDAK DAPAT dan TIDAK BOLEH dijalankan**. Sistem hanya mendukung sinkronisasi data bertarget (targeted sync) atau pencarian berbasis keyword terbatas.

---

## 2. Pengamatan Teknis per Endpoint

### A. GET `/api/pencarian/pt/{keyword}`
- **Status:** 200 OK
- **Struktur:** `{ status: "success", data: [ { id, kode, nama_singkat, nama } ] }`
- **Catatan Pembersihan:** `kode` kampus (misal `"005016"`) bersih, siap disimpan ke tabel `institutions`.

### B. GET `/api/pencarian/mhs/{keyword}`
- **Status:** 200 OK
- **Struktur:** `{ status: "success", data: [ { id, nama, nim, nama_pt, sinkatan_pt, nama_prodi } ] }`
- **Typo Vendor:** Field singkatan pada API resmi tertulis `sinkatan_pt`.
- **Batas Hasil:** Tepat 100 item untuk keyword umum (seperti nama kampus atau nama awalan populer).
- **Pengujian Perubahan ID:**
  - Permintaan 1 ID: `TWMx0N5lrbYwlM7dWtCondNOapu0mY3Nn2IoQ_MR9saWSQs-WR-QvIqmlPcZ3fne0mpBNA==`
  - Permintaan 2 ID: `xYdZl0rEhEgWQdOvleHtB7fVjp6VIg57OW77feHptCp3embhzlIXA0Y98jOrhBLBzVlceQ==`
  - Data NIM dan Nama: 100% identik.
  - Kesimpulan: ID dienkripsi secara dinamis di sisi server PDDikti.

### C. Pengujian Query Pagination
- `?page=2`: Status 200, count 100, item pertama sama persis dengan query standar.
- `?offset=10`: Status 200, count 100, item pertama sama persis dengan query standar.
- `?limit=200`: Status 200, count 100, item pertama sama persis dengan query standar.
- **Kesimpulan:** Server PDDikti tidak mendukung pagination query pada endpoint pencarian publik.

### D. POST `/api/detail/mhs`
- **Body:** `{"id": "<id_dari_pencarian_terbaru>"}`
- **Header Wajib:**
  - `Content-Type: application/json`
  - `Referer: https://pddikti.kemdiktisaintek.go.id/detail-mhs/<id>`
  - `Origin: https://pddikti.kemdiktisaintek.go.id`
- **Status:** 200 OK
- **Field yang Tersedia:**
  - `nama_pt` (string)
  - `kode_pt` (string, perlu `.trim()`)
  - `kode_prodi` (string, untuk kebutuhan internal)
  - `prodi` (string)
  - `nama` (string)
  - `nim` (string, perlu `.trim()`)
  - `jenis_daftar` (string)
  - `id_pt`, `id_sms` (string)
  - `jenis_kelamin` (string)
  - `jenjang` (string, misal "Diploma tiga", "S1")
  - `status_saat_ini` (string, perlu pembersihan trailing dash/spasi seperti `"Lulus-"`)
  - `tanggal_masuk` (string ISO date `"YYYY-MM-DD"`, memungkinkan ekstraksi `tahun_masuk`)

---

## 3. Implikasi Arsitektur Database & Aplikasi

1. **Skema Mahasiswa (Tabel `students`)**:
   - Primary Key: UUID auto-generated atau synthetic id.
   - Unique Constraint: `UNIQUE(kode_pt, nim)`.
   - Kolom `tahun_masuk`: Diambil dari `EXTRACT(YEAR FROM tanggal_masuk)` atau parsed string.
   - Kolom `status`: Nilai bersih dari `status_saat_ini`.
2. **Penyimpanan Kampus (Tabel `institutions`)**:
   - Primary Key: `kode_pt` (VARCHAR).
   - Kolom: `nama`, `nama_singkat`, `created_at`, `updated_at`.
3. **Penyimpanan Riwayat Sinkronisasi (Tabel `sync_runs`)**:
   - Kolom: `id`, `started_at`, `ended_at`, `status`, `target_keyword`, `processed_count`, `inserted_count`, `updated_count`, `error_message`.
4. **Pencarian Publik**:
   - Dilakukan langsung ke Supabase PostgreSQL menggunakan indeks teks dan filter SQL yang aman.
   - Server-side pagination bekerja optimal di database PostgreSQL (`LIMIT` / `OFFSET`).
   - Ekspor CSV mengambil seluruh record yang memenuhi filter dari database tanpa terpotong limit halaman.
