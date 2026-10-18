import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Direktori Mahasiswa Aceh | Portal Penelusuran & Verifikasi Mahasiswa',
  description: 'Direktori resmi penelusuran data mahasiswa perguruan tinggi di Provinsi Aceh. Cari berdasarkan nama, NIM, dan perguruan tinggi.',
  keywords: ['mahasiswa aceh', 'pddikti', 'direktori mahasiswa aceh', 'verifikasi mahasiswa', 'perguruan tinggi aceh'],
  authors: [{ name: 'Direktori Mahasiswa Aceh' }],
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={plusJakartaSans.variable}>
      <body className="font-sans antialiased text-slate-900 bg-slate-50 flex flex-col min-h-screen">
        {children}
      </body>
    </html>
  );
}
