'use client'

import { usePathname } from 'next/navigation'
import styles from './Header.module.css'

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': {
    title: 'Dashboard',
    subtitle: 'Overview semua job dan performance',
  },
  '/jobs': {
    title: 'Job Monitor',
    subtitle: 'Track dan urus semua job across departments',
  },
  '/reports': {
    title: 'Reports',
    subtitle: 'Analisis dan laporan kewangan',
  },
  '/settings': {
    title: 'Settings',
    subtitle: 'Pengurusan pengguna dan konfigurasi',
  },
}

export default function Header() {
  const pathname = usePathname()
  const page = pageTitles[pathname] || pageTitles['/dashboard']

  return (
    <header className={styles.header}>
      <div className={styles.content}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>{page.title}</h1>
          <p className={styles.subtitle}>{page.subtitle}</p>
        </div>
        <div className={styles.actions}>
          {/* Future: search, notifications, etc. */}
        </div>
      </div>
    </header>
  )
}
