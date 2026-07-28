import styles from './page.module.css'

export default function ReportsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.placeholder}>
        <span className={styles.icon}>📈</span>
        <h2 className={styles.title}>Reports</h2>
        <p className={styles.subtitle}>
          Summary cards, monthly breakdown, conversion funnel dan export akan dibina di Conversation 6.
        </p>
      </div>
    </div>
  )
}
