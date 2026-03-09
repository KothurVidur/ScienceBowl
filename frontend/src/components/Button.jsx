import styles from './Button.module.css';
const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  loading = false,
  icon,
  className = '',
  ...props
}) => {
  const classNames = [styles.button, styles[variant], styles[size], fullWidth && styles.fullWidth, disabled && styles.disabled, loading && styles.loading, className].filter(Boolean).join(' ');
  return <button className={classNames} disabled={disabled || loading} {...props}>

      {}
      {loading ? <span className={styles.spinner}></span> : <>
          {}
          {icon && <span className={styles.icon}>{icon}</span>}
          {children}
        </>}
    </button>;
};
export default Button;
