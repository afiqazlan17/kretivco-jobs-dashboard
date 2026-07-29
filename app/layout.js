import './globals.css'
import { AuthProvider, DataProvider } from '@/lib/hooks'
import AppShell from '@/components/AppShell'

export const metadata = { title: 'Kretivco Job Dashboard', description: 'Internal job management — Kretivco Mediaworks' }

export default function RootLayout({ children }) {
  return (
    <html lang="ms">
      <body>
        <AuthProvider>
          <DataProvider>
            <AppShell>{children}</AppShell>
          </DataProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
