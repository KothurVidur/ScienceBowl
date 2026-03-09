import { forwardRef } from 'react';
import styles from './Input.module.css';
const Input = forwardRef(({
  label,
  error,
  icon,
  className = '',
  ...props
}, ref) => {
  return <div className={`${styles.inputGroup} ${className}`}>
      {label && <label className={styles.label}>{label}</label>}
      <div className={`${styles.inputWrapper} ${error ? styles.hasError : ''}`}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <input ref={ref} className={`${styles.input} ${icon ? styles.withIcon : ''}`} {...props} />

      </div>
      {error && <span className={styles.error}>{error}</span>}
    </div>;
});
Input.displayName = 'Input';
export default Input;
