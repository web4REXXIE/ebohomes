import Link from 'next/link'
import { Home, Search } from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Page not found | EboHomes',
}

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-primary">Error 404</p>
        <h1 className="mt-3 text-3xl font-extrabold text-foreground sm:text-4xl">
          We could not find that page
        </h1>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          The link may be old or typed wrongly. You can go back home or look through the available properties.
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link href="/" className="sm:w-auto">
            <Button className="h-11 w-full gap-2 px-6 sm:w-auto">
              <Home size={16} />
              Go to home
            </Button>
          </Link>
          <Link href="/search" className="sm:w-auto">
            <Button variant="outline" className="h-11 w-full gap-2 px-6 sm:w-auto">
              <Search size={16} />
              Browse properties
            </Button>
          </Link>
        </div>
      </main>
    </div>
  )
}