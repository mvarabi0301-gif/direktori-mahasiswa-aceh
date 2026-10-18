-- =====================================================================
-- DIREKTORI MAHASISWA ACEH - DATABASE SCHEMA & MIGRATIONS
-- Supabase PostgreSQL
-- =====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. INSTITUTIONS TABLE (Perguruan Tinggi)
CREATE TABLE IF NOT EXISTS public.institutions (
    kode_pt VARCHAR(50) PRIMARY KEY,
    nama VARCHAR(255) NOT NULL,
    nama_singkat VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indeks untuk pencarian kampus cepat
CREATE INDEX IF NOT EXISTS idx_institutions_nama ON public.institutions (nama);
CREATE INDEX IF NOT EXISTS idx_institutions_nama_singkat ON public.institutions (nama_singkat);
CREATE INDEX IF NOT EXISTS idx_institutions_nama_trgm ON public.institutions USING gin (nama gin_trgm_ops);

-- 3. STUDENTS TABLE (Mahasiswa)
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode_pt VARCHAR(50) NOT NULL REFERENCES public.institutions(kode_pt) ON UPDATE CASCADE ON DELETE RESTRICT,
    nama_pt VARCHAR(255) NOT NULL,
    nim VARCHAR(100) NOT NULL,
    nama VARCHAR(255) NOT NULL,
    kode_prodi VARCHAR(50), -- Keperluan internal sistem, tidak dijadikan filter publik
    prodi VARCHAR(255),
    jenjang VARCHAR(100),
    status VARCHAR(100),
    tanggal_masuk DATE,
    tahun_masuk INTEGER,
    jenis_kelamin VARCHAR(10),
    raw_detail JSONB DEFAULT '{}'::jsonb,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    
    -- Composite Unique Key berdasarkan temuan diagnostik empiris
    CONSTRAINT uq_students_kode_pt_nim UNIQUE (kode_pt, nim)
);

-- Indeks esensial untuk performa pencarian publik
CREATE INDEX IF NOT EXISTS idx_students_kode_pt ON public.students (kode_pt);
CREATE INDEX IF NOT EXISTS idx_students_nim ON public.students (nim);
CREATE INDEX IF NOT EXISTS idx_students_tahun_masuk ON public.students (tahun_masuk);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students (status);
CREATE INDEX IF NOT EXISTS idx_students_nama_trgm ON public.students USING gin (nama gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_students_nim_trgm ON public.students USING gin (nim gin_trgm_ops);

-- 4. SYNC RUNS TABLE (Audit Log Sinkronisasi)
CREATE TABLE IF NOT EXISTS public.sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    ended_at TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'running', -- 'running', 'success', 'partial', 'failed'
    target_type VARCHAR(50) NOT NULL,              -- 'pt', 'mhs_keyword', 'targeted'
    target_keyword VARCHAR(255),
    processed_count INTEGER NOT NULL DEFAULT 0,
    inserted_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON public.sync_runs (status);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at ON public.sync_runs (started_at DESC);

-- 5. AUTO UPDATE TIMESTAMP TRIGGER
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_institutions_updated_at ON public.institutions;
CREATE TRIGGER set_institutions_updated_at
    BEFORE UPDATE ON public.institutions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_students_updated_at ON public.students;
CREATE TRIGGER set_students_updated_at
    BEFORE UPDATE ON public.students
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- Pastikan tabel aman: publik hanya boleh membaca, penulisan hanya melalui Service Role / Server-side

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

-- Policy Institutions: Publik dapat membaca data kampus
DROP POLICY IF EXISTS "Public can view institutions" ON public.institutions;
CREATE POLICY "Public can view institutions"
    ON public.institutions
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Policy Students: Publik dapat membaca data mahasiswa
DROP POLICY IF EXISTS "Public can view students" ON public.students;
CREATE POLICY "Public can view students"
    ON public.students
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Policy Sync Runs: Hanya service_role yang memiliki akses (audit internal)
-- Tidak ada policy SELECT/INSERT/UPDATE untuk anon/authenticated pada sync_runs.
-- Supabase service_role secara otomatis bypass RLS.
