import styles from './page.module.css'

export default function SettingsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.placeholder}>
        <span className={styles.icon}>⚙️</span>
        <h2 className={styles.title}>Settings</h2>
        <p className={styles.subtitle}>
          User management, role assignment dan department configuration akan dibina di Conversation 7.
        </p>
      </div>
    </div>
  )
}
