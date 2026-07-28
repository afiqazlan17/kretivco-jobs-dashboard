import styles from './page.module.css'

export default function DashboardPage() {
  return (
    <div className={styles.page}>
      <div className={styles.placeholder}>
        <span className={styles.icon}>📊</span>
        <h2 className={styles.title}>Dashboard</h2>
        <p className={styles.subtitle}>
          Stat cards, financial summary, deadline alerts dan department breakdown akan dibina di Conversation 2.
        </p>
      </div>
    </div>
  )
}
