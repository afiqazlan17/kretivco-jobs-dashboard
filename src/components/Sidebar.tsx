'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import styles from './Sidebar.module.css'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/jobs', label: 'Job Monitor', icon: '📋' },
  { href: '#new-job', label: 'New Job', icon: '➕', isAction: true },
  { href: '/reports', label: 'Reports', icon: '📈' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function Sidebar() {
  const pathname = usePathname()

  const handleNewJob = () => {
    // Will trigger modal in future conversation
    console.log('Open New Job modal')
  }

  return (
    <>
      {/* Desktop / Tablet Sidebar */}
      <aside className={styles.sidebar}>
        {/* Logo Section */}
        <div className={styles.logoSection}>
          <div className={styles.logoMark}>K</div>
          <div className={styles.logoText}>
            <span className={styles.brandName}>Kretivco</span>
            <span className={styles.badge}>Job Dashboard</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className={styles.nav}>
          {navItems.map((item) => {
            const isActive = !item.isAction && pathname === item.href

            if (item.isAction) {
              return (
                <button
                  key={item.label}
                  className={styles.navItem}
                  onClick={handleNewJob}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  <span className={styles.navLabel}>{item.label}</span>
                </button>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
              >
                {isActive && <span className={styles.activeBar} />}
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* User Section */}
        <div className={styles.userSection}>
          <div className={styles.userAvatar}>A</div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>Afiq Azlan</span>
            <span className={styles.userRole}>BOD</span>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className={styles.bottomNav}>
        {navItems.map((item) => {
          const isActive = !item.isAction && pathname === item.href

          if (item.isAction) {
            return (
              <button
                key={item.label}
                className={`${styles.bottomNavItem} ${styles.bottomNavAction}`}
                onClick={handleNewJob}
              >
                <span className={styles.bottomNavIcon}>{item.icon}</span>
              </button>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.bottomNavItem} ${isActive ? styles.bottomNavActive : ''}`}
            >
              <span className={styles.bottomNavIcon}>{item.icon}</span>
              <span className={styles.bottomNavLabel}>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
