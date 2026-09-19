import type { Metadata, Viewport } from 'next';
import { THEME_COLORS } from '@newax/shared';
import './globals.css';
import { ServiceWorkerRegistration } from '@/components/service-worker-registration';

export const metadata: Metadata = {
  title: 'Till',
  description: 'Newax POS — the till',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: THEME_COLORS.accent.DEFAULT,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
