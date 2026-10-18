export interface Institution {
  kode_pt: string;
  nama: string;
  nama_singkat: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface Student {
  id: string;
  kode_pt: string;
  nama_pt: string;
  nim: string;
  nama: string;
  kode_prodi?: string | null; // Keperluan internal saja, bukan filter publik
  prodi: string | null;
  jenjang: string | null;
  status: string | null;
  tanggal_masuk: string | null;
  tahun_masuk: number | null;
  jenis_kelamin: string | null;
  raw_detail?: Record<string, unknown>;
  synced_at?: string;
  created_at?: string;
  updated_at?: string;
}

// Data publik yang ditampilkan di tabel dan ekspor
export type StudentPublic = Omit<Student, 'raw_detail' | 'kode_prodi'>;

export interface StudentQueryParams {
  query?: string;
  kode_pt?: string;
  tahun_masuk?: number | string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface StudentQueryResult {
  data: StudentPublic[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isConfigured: boolean;
  message?: string;
}

export interface SyncRun {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  target_type: 'pt' | 'mhs_keyword' | 'targeted';
  target_keyword: string | null;
  processed_count: number;
  inserted_count: number;
  updated_count: number;
  error_message: string | null;
  created_at: string;
}

export interface FilterOptions {
  years: number[];
  statuses: string[];
}
