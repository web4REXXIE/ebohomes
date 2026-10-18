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

export const metadata: Metadata = {
  title: 'EboHomes - Find Your Perfect Home in Ebonyi',
  description: 'Direct landlord-to-tenant rental listings for Ebonyi State, Nigeria',
  applicationName: 'EboHomes',
  generator: 'v0.app',
  appleWebApp: {
    capable: true,
    title: 'EboHomes',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      {
        url: '/icon.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-white.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF7F2' },
    { media: '(prefers-color-scheme: dark)', color: '#1C1A17' },
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
        <InstallProvider>
          <NotificationProvider>
            <PushSync />
            <PushPrompt />
            <SplashScreen>
              <div className="pb-16 md:pb-0">
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