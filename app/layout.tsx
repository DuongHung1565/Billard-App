import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Cue Club · Quản lý Billiards', description: 'Không gian vận hành quán billiards: sơ đồ bàn trực tiếp, đặt lịch và thanh toán.', icons: { icon: '/favicon.svg' } };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="vi"><body>{children}</body></html>; }
