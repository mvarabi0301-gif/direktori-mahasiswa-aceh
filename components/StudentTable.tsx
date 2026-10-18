'use client';

import React from 'react';
import { StudentPublic } from '@/lib/types';
import { Building2, GraduationCap, Calendar, User, Hash } from 'lucide-react';

interface StudentTableProps {
  students: StudentPublic[];
  currentPage: number;
  pageSize: number;
}

function getStatusBadge(status?: string | null) {
  const s = (status || '').toLowerCase();
  if (s.includes('aktif') || s.includes('belajar')) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1.5 animate-pulse"></span>
        {status || 'Aktif'}
      </span>
    );
  }
  if (s.includes('lulus')) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mr-1.5"></span>
        {status || 'Lulus'}
      </span>
    );
  }
  if (s.includes('cuti') || s.includes('non-aktif') || s.includes('kampus merdeka')) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mr-1.5"></span>
        {status || 'Cuti'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
      {status || 'Lainnya'}
    </span>
  );
}

export default function StudentTable({ students, currentPage, pageSize }: StudentTableProps) {
  const startNumber = (currentPage - 1) * pageSize;

  return (
    <div className="w-full">
      {/* Desktop Table View (>= md) */}
      <div className="hidden md:block overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-bold uppercase tracking-wider text-slate-500">
              <th scope="col" className="py-3.5 px-4 text-center w-12">#</th>
              <th scope="col" className="py-3.5 px-4">Mahasiswa & NIM</th>
              <th scope="col" className="py-3.5 px-4">Perguruan Tinggi</th>
              <th scope="col" className="py-3.5 px-4">Program Studi & Jenjang</th>
              <th scope="col" className="py-3.5 px-4 text-center">Angkatan</th>
              <th scope="col" className="py-3.5 px-4 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {students.map((student, idx) => {
              const rowNum = startNumber + idx + 1;
              return (
                <tr
                  key={`${student.kode_pt}-${student.nim}`}
                  className="hover:bg-emerald-50/40 transition-colors group"
                >
                  {/* Number */}
                  <td className="py-3.5 px-4 text-center text-xs text-slate-400 font-mono">
                    {rowNum}
                  </td>

                  {/* Student Name & NIM */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100/70 text-emerald-800 flex items-center justify-center font-bold text-xs flex-shrink-0 group-hover:bg-emerald-200/80 transition">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 group-hover:text-emerald-950">
                          {student.nama}
                        </div>
                        <div className="text-xs font-mono text-slate-500 flex items-center space-x-1 mt-0.5">
                          <Hash className="w-3 h-3 text-slate-400" />
                          <span>{student.nim}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Campus */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center space-x-2 text-slate-800">
                      <Building2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                      <div>
                        <div className="font-medium leading-snug">{student.nama_pt}</div>
                        <div className="text-xs text-slate-400">Kode PT: {student.kode_pt}</div>
                      </div>
                    </div>
                  </td>

                  {/* Prodi & Jenjang */}
                  <td className="py-3.5 px-4">
                    <div className="text-slate-800">
                      <div className="font-medium">{student.prodi || '-'}</div>
                      <div className="text-xs text-slate-500 font-normal mt-0.5">
                        {student.jenjang || 'Program Studi'}
                      </div>
                    </div>
                  </td>

                  {/* Admission Year */}
                  <td className="py-3.5 px-4 text-center">
                    <span className="inline-flex items-center text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                      {student.tahun_masuk || (student.tanggal_masuk ? student.tanggal_masuk.slice(0, 4) : '-')}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-4 text-center">
                    {getStatusBadge(student.status)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Layout (< md) */}
      <div className="md:hidden space-y-3">
        {students.map((student, idx) => {
          const rowNum = startNumber + idx + 1;
          return (
            <div
              key={`${student.kode_pt}-${student.nim}`}
              className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:border-emerald-300 transition"
            >
              {/* Card Header: Number, Name, Status */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-2.5">
                  <span className="text-xs font-mono font-bold text-slate-400 bg-slate-100 w-6 h-6 rounded-md flex items-center justify-center">
                    {rowNum}
                  </span>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{student.nama}</h3>
                    <p className="text-xs font-mono text-slate-500">NIM: {student.nim}</p>
                  </div>
                </div>
                <div>{getStatusBadge(student.status)}</div>
              </div>

              {/* Card Details */}
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center space-x-2">
                  <Building2 className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
                  <span className="truncate font-medium text-slate-800">{student.nama_pt}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <GraduationCap className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span>
                    {student.prodi || '-'} {student.jenjang ? `(${student.jenjang})` : ''}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span>
                    Angkatan:{' '}
                    <strong className="text-slate-800">
                      {student.tahun_masuk || (student.tanggal_masuk ? student.tanggal_masuk.slice(0, 4) : '-')}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
