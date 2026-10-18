# Direktori Mahasiswa Aceh

Portal penelusuran dan verifikasi akademik mahasiswa perguruan tinggi di Provinsi Aceh, dibangun menggunakan **Next.js App Router**, **TypeScript**, **Tailwind CSS**, dan **Supabase PostgreSQL**.

---

## 1. Fitur Utama

- **Pencarian Cepat & Aman**: Penelusuran berdasarkan Nama Mahasiswa atau NIM dengan pencarian global atau dibatasi pada perguruan tinggi tertentu.
- **Autocomplete Kampus Dinamis**: Daftar kampus diambil langsung secara dinamis dari tabel `institutions` di basis data Supabase (bukan daftar statis/mock).
- **Filter Fleksibel**: Filter berdasarkan Angkatan (Tahun Masuk) dan Status Mahasiswa (Aktif, Lulus, Cuti, dll.) yang disesuaikan secara dinamis dengan data yang tersedia. *Catatan: Sesuai aturan direktori publik, filter program studi tidak ditampilkan di antarmuka publik.*
- **Paginasi Server-side**: Navigasi halaman cepat dan teroptimasi langsung pada layer database PostgreSQL.
- **Ekspor CSV Lengkap**: Mengunduh seluruh hasil yang memenuhi kriteria pencarian dan filter saat ini (bukan hanya halaman yang sedang terbuka), dengan encoding UTF-8 BOM yang kompatibel dengan Microsoft Excel.
- **Transparansi Data**: Menghindari klaim angka fiktif dan secara transparan mengedukasi batasan teknis API PDDikti.
- **Arsitektur Sinkronisasi Server-side**: Modul sinkronisasi terpisah dari website publik yang dapat dijalankan secara manual dan aman dengan *rate-limiting*.

---

## 2. Temuan Diagnostik Empiris API PDDikti

Sebelum melakukan implementasi, modul diagnostik telah dijalankan pada endpoint resmi `https://pddikti.kemdiktisaintek.go.id`:

| Endpoint | Status | Karakteristik & Batasan Teknis |
|---|---|---|
| `GET /api/pencarian/pt/{keyword}` | 200 OK | Mengembalikan daftar kampus dengan kode PT resmi (misal `005016` untuk Politeknik Negeri Lhokseumawe). |
| `GET /api/pencarian/mhs/{keyword}` | 200 OK | **Hard cap maksimal 100 data per permintaan**. Nilai field `id` bersifat **efemeral/dinamis** (berubah di setiap panggilan). |
| Query Pagination (`?page=2`, `?offset=10`) | 200 OK | **Diabaikan oleh server**. Server tetap mengembalikan 100 data indeks pertama yang sama. Tidak ada pagination publik yang terkonfirmasi. |
| `POST /api/detail/mhs` | 200 OK | Membutuhkan header `Referer` dan `Origin` dari domain PDDikti. Menyediakan data: `nama_pt`, `kode_pt`, `kode_prodi`, `prodi`, `status_saat_ini`, `jenjang`, `tanggal_masuk`. |

> **Keputusan Arsitektur**: Karena ketiadaan mekanisme paginasi massal pada API pencarian PDDikti, **sinkronisasi massal seluruh Aceh tidak dijalankan**. Sistem menggunakan **kombinasi unik `(kode_pt, nim)`** sebagai Composite Unique Key (bukan ID PDDikti yang dinamis) dan mendukung sinkronisasi bertarget.

---

## 3. Struktur Basis Data (Supabase PostgreSQL)

Skema database lengkap tersedia pada file:
- [`supabase/schema.sql`](supabase/schema.sql)
- [`supabase/migrations/20261018000000_init_schema.sql`](supabase/migrations/20261018000000_init_schema.sql)

### Tabel yang Digunakan:
1. `institutions`:
   - `kode_pt` (Primary Key, VARCHAR)
   - `nama` (VARCHAR), `nama_singkat` (VARCHAR), `metadata` (JSONB)
2. `students`:
   - `id` (UUID Primary Key)
   - `kode_pt` (Foreign Key ke `institutions.kode_pt`)
   - `nama_pt`, `nim`, `nama`
   - `kode_prodi` (Disimpan untuk keperluan internal sistem, tidak diekspos sebagai filter publik)
   - `prodi`, `jenjang`, `status`, `tanggal_masuk`, `tahun_masuk`, `jenis_kelamin`
   - `CONSTRAINT uq_students_kode_pt_nim UNIQUE (kode_pt, nim)`
3. `sync_runs`:
   - Audit trail sinkronisasi server-side: waktu mulai/selesai, status, jumlah data diproses, data baru, dan data diperbarui.
4. **Row Level Security (RLS)**:
   - Akses publik (`anon`, `authenticated`): Hanya memiliki hak `SELECT` pada tabel `institutions` dan `students`.
   - Hak `INSERT`, `UPDATE`, `DELETE`: Hanya dimiliki oleh `service_role` di backend / script sinkronisasi.

---

## 4. Instalasi dan Menjalankan Aplikasi

### Persyaratan:
- Node.js versi 18+ (direkomendasikan Node.js 20 atau 24)
- Akun Supabase (project PostgreSQL)

### Langkah-langkah:

1. **Pasang Dependensi**:
   ```bash
   npm install
   ```

2. **Siapkan Environment Variables**:
   Salin file `.env.example` ke `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Lengkapi variabel berikut pada `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
   SYNC_SECRET_TOKEN=your-random-token
   ```

3. **Jalankan Skema Database di Supabase**:
   Salin seluruh isi file [`supabase/schema.sql`](supabase/schema.sql) dan jalankan pada **SQL Editor** di dashboard Supabase Anda.

4. **Jalankan Uji Diagnostik API**:
   ```bash
   npm run test:api
   ```

5. **Jalankan Sinkronisasi Bertarget (Opsional / Manual)**:
   - Sinkronisasi daftar kampus utama Aceh:
     ```bash
     node scripts/sync-runner.mjs --pt-list
     ```
   - Sinkronisasi sampel data kampus tertentu:
     ```bash
     node scripts/sync-runner.mjs --campus="Politeknik Negeri Lhokseumawe" --mhs="Politeknik Negeri Lhokseumawe" --max=10
     ```

6. **Jalankan Server Pengembangan**:
   ```bash
   npm run dev
   ```
   Buka browser di `http://localhost:3000`.

7. **Kompilasi Produksi (Production Build)**:
   ```bash
   npm run build
   npm run start
   ```

---

## 5. Ringkasan File Proyek

- `app/`
  - `page.tsx`: Halaman utama direktori mahasiswa dengan pencarian, filter, dan paginasi.
  - `layout.tsx`: Root layout Next.js dengan metadata SEO dan tipografi.
  - `globals.css`: Konfigurasi Tailwind CSS dan styling global.
  - `api/students/route.ts`: Endpoint GET untuk query mahasiswa terpaginasi dari Supabase.
  - `api/students/export/route.ts`: Endpoint GET untuk ekspor CSV seluruh data yang cocok.
  - `api/institutions/route.ts`: Endpoint GET untuk autocomplete kampus dari database.
  - `api/filters/route.ts`: Endpoint GET untuk metadata opsi filter tahun masuk dan status.
  - `api/sync/route.ts`: Endpoint POST terproteksi untuk memicu sinkronisasi bertarget.
- `components/`
  - `Navbar.tsx`: Header dan identitas Direktori Mahasiswa Aceh.
  - `SearchFilterBar.tsx`: Baris pencarian, autocomplete kampus, tombol filter, dan ekspor CSV.
  - `CampusAutocomplete.tsx`: Komponen autocomplete kampus berbasis data dinamis.
  - `StudentTable.tsx`: Tabel data mahasiswa responsif desktop dan kartu mobile.
  - `Pagination.tsx`: Kontrol paginasi server-side.
  - `StatusNotice.tsx`: Komponen edukasi transparansi data dan batasan PDDikti.
  - `EmptyState.tsx`: Penanganan berbagai kondisi kosong, error, dan belum terkonfigurasi.
  - `LoadingSkeleton.tsx`: Efek shimmer pemuatan data.
- `lib/`
  - `types.ts`: Definisi tipe data TypeScript.
  - `data/students.ts`: Abstraksi data access layer PostgreSQL via Supabase.
  - `supabase/client.ts` & `supabase/server.ts`: Inisialisasi client Supabase anon dan service role.
  - `sync/sync-service.ts`: Mesin sinkronisasi server-side bertarget.
- `scripts/`
  - `test-pddikti-api.mjs`: Modul diagnostik mandiri API PDDikti.
  - `sync-runner.mjs`: CLI runner sinkronisasi manual.
- `supabase/`
  - `schema.sql`: Skema SQL terkonsolidasi dengan RLS dan indeks.
  - `migrations/20261018000000_init_schema.sql`: File migrasi awal.
- `docs/`
  - `api-diagnostic-report.md`: Laporan komprehensif hasil pengujian empiris API PDDikti.
