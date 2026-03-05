/**
 * ============================================================================
 * BUTTON.JSX - REUSABLE BUTTON COMPONENT
 * ============================================================================
 * 
 * WHY CREATE A BUTTON COMPONENT?
 * Instead of using <button> directly everywhere, a component provides:
 * - Consistent styling across the app
 * - Built-in variants (primary, secondary, danger)
 * - Loading state handling
 * - Disabled state styling
 * - Easy to modify all buttons at once
 * 
 * COMPONENT DESIGN PATTERNS:
 * This demonstrates several important patterns:
 * 1. Props with defaults
 * 2. CSS Modules for scoped styling
 * 3. Conditional class names
 * 4. Spread operator for remaining props
 * 5. Composition (icon + children)
 * 
 * ============================================================================
 */

/**
 * CSS MODULES
 * 
 * Import styles from .module.css file.
 * CSS Modules automatically generate unique class names to prevent conflicts.
 * 
 * Button.module.css:
 *   .button { background: blue; }
 * 
 * Compiles to:
 *   .Button_button_a1b2c { background: blue; }
 * 
 * Usage:
 *   <div className={styles.button}>  ← Uses the unique class name
 * 
 * BENEFITS:
 * - No class name conflicts between components
 * - Styles are scoped to the component
 * - Dead code elimination (unused styles removed)
 * - Can still use global styles when needed
 */
import styles from './Button.module.css';

/**
 * BUTTON COMPONENT
 * 
 * PROPS DESTRUCTURING WITH DEFAULTS:
 * ({ variant = 'primary', size = 'md', ... })
 * 
 * This extracts props and provides default values.
 * If variant isn't passed, it defaults to 'primary'.
 * 
 * PROP TYPES:
 * - children: Content inside the button (text, icons, etc.)
 * - variant: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'cyan'
 * - size: 'sm' | 'md' | 'lg'
 * - fullWidth: Boolean - should button span full width?
 * - disabled: Boolean - prevent interaction
 * - loading: Boolean - show loading spinner
 * - icon: React node - icon to display before text
 * - className: Additional CSS classes
 * - ...props: Any other props (onClick, type, etc.)
 */
const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  fullWidth = false,
  disabled = false,
  loading = false,
  icon,
  className = '',
  /**
   * REST OPERATOR (...props)
   * 
   * Collects all remaining props into an object.
   * This allows passing any standard button attributes:
   * - onClick
   * - type="submit"
   * - aria-label
   * - etc.
   * 
   * Without explicitly listing them all.
   */
  ...props 
}) => {
  /**
   * BUILDING CLASS NAMES DYNAMICALLY
   * 
   * We build an array of class names, then join them into a string.
   * 
   * TECHNIQUE:
   * [
   *   styles.button,           // Always included
   *   styles[variant],         // Dynamic access: styles.primary, styles.danger
   *   styles[size],            // Dynamic access: styles.sm, styles.md, styles.lg
   *   fullWidth && styles.fullWidth,  // Included if truthy
   *   disabled && styles.disabled,
   *   loading && styles.loading,
   *   className                // User-provided classes
   * ]
   * 
   * DYNAMIC PROPERTY ACCESS:
   * styles[variant] is like styles.primary when variant = 'primary'
   * This is how we map prop values to CSS classes.
   * 
   * CONDITIONAL CLASSES:
   * fullWidth && styles.fullWidth
   * If fullWidth is true → styles.fullWidth (the class name)
   * If fullWidth is false → false (will be filtered out)
   * 
   * .filter(Boolean)
   * Removes falsy values (false, null, undefined, '', 0)
   * 
   * .join(' ')
   * Combines array into space-separated string
   * Result: "Button_button_x1 Button_primary_x2 Button_md_x3"
   */
  const classNames = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    disabled && styles.disabled,
    loading && styles.loading,
    className
  ].filter(Boolean).join(' ');

  return (
    /**
     * THE BUTTON ELEMENT
     * 
     * className={classNames}: Apply all our computed classes
     * disabled={disabled || loading}: Disable when loading too
     * {...props}: Spread all remaining props onto the button
     * 
     * SPREAD PROPS:
     * {...props} applies each property in the props object as an attribute.
     * If props = { onClick: handleClick, type: 'submit' }
     * It's equivalent to: onClick={handleClick} type="submit"
     */
    <button 
      className={classNames} 
      disabled={disabled || loading}
      {...props}
    >
      {/**
       * CONDITIONAL RENDERING
       * 
       * If loading, show spinner.
       * Otherwise, show icon (if provided) and children.
       * 
       * TERNARY EXPRESSION:
       * condition ? ifTrue : ifFalse
       * 
       * FRAGMENT <>...</>:
       * Groups multiple elements without adding a DOM node.
       */}
      {loading ? (
        <span className={styles.spinner}></span>
      ) : (
        <>
          {/**
           * CONDITIONAL RENDERING WITH &&
           * 
           * {icon && <span>...</span>}
           * Only renders if icon is truthy.
           * 
           * Short-circuit evaluation:
           * If icon is falsy (undefined, null), returns falsy value (nothing rendered)
           * If icon is truthy, returns the <span> element
           */}
          {icon && <span className={styles.icon}>{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
};

export default Button;
