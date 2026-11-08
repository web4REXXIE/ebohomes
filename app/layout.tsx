import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { SplashScreen } from '@/components/splash-screen'
import { BottomNav } from '@/components/bottom-nav'
import './globals.css'
import { HelpBubble } from '@/components/help-bubble'
import { InstallProvider } from '@/components/install-provider'
import { InstallBanner } from '@/components/install-banner'
import { InstallSheet } from '@/components/install-sheet'
import { NotificationProvider } from '@/components/notification-provider'
import { PushSync } from '@/components/push-sync'
import { PushPrompt } from '@/components/push-prompt'
import { TapFeedback } from '@/components/tap-feedback'
import { BRAND_TITLE } from '@/lib/brand'

export const metadata: Metadata = {
  metadataBase: new URL((process.env.NEXT_PUBLIC_SITE_URL || 'https://ebohomes.vercel.app').replace(/\/+$/, '')),
  title: {
    default: BRAND_TITLE,
    template: '%s | EboHomes',
  },
  description: 'Reviewed rental listings in Ebonyi State, Nigeria. Search, request a viewing and apply online.',
  applicationName: 'EboHomes',
  robots: { index: true, follow: true },
  openGraph: {
    siteName: 'EboHomes',
    type: 'website',
    locale: 'en_NG',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'EboHomes' }],
  },
  twitter: { card: 'summary_large_image', images: ['/og-image.jpg'] },
  appleWebApp: {
    capable: true,
    title: 'EboHomes',
    statusBarStyle: 'default',
  },
  icons: {
    // Real PNG/WebP icons with the brand mark on forest green. The old pair pointed at
    // /icon.png and /icon-white.png, which are JPEGs on a black background.
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0A2E1A' },
    { media: '(prefers-color-scheme: dark)', color: '#0A2E1A' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="light">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__ebohomesInstallEvent=e;});",
          }}
        />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        {/* Ring + press effect when any button or link is touched, on every page */}
        <TapFeedback />
        <InstallProvider>
          <NotificationProvider>
            <PushSync />
            <PushPrompt />
            <SplashScreen>
              <div className="pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
                {children}
              </div>
            </SplashScreen>
            <BottomNav />
            <HelpBubble />
            <InstallBanner />
            <InstallSheet />
          </NotificationProvider>
        </InstallProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
