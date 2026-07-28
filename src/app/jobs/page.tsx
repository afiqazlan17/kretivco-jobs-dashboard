import styles from './page.module.css'

export default function JobsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.placeholder}>
        <span className={styles.icon}>📋</span>
        <h2 className={styles.title}>Job Monitor</h2>
        <p className={styles.subtitle}>
          Filter bar, data table, job detail panel dan quick status update akan dibina di Conversation 3.
        </p>
      </div>
    </div>
  )
}
