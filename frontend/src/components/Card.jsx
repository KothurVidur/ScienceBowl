import styles from './Card.module.css';
const Card = ({
  children,
  variant = 'default',
  glow = false,
  hoverable = false,
  className = '',
  ...props
}) => {
  const classNames = [styles.card, styles[variant], glow && styles.glow, hoverable && styles.hoverable, className].filter(Boolean).join(' ');
  return <div className={classNames} {...props}>
      {children}
    </div>;
};
export default Card;
