import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        outline: 'border-border bg-background text-foreground hover:bg-muted dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-muted hover:text-foreground dark:hover:bg-muted/50',
        destructive: 'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30',
        link: 'text-primary underline-offset-4 hover:underline p-0 h-auto',
        // Phase 3: dark text on gold (white on gold failed contrast at 2.15:1; this is about 7:1).
        gold: 'bg-featured text-featured-foreground shadow-sm hover:bg-featured/90 focus-visible:ring-featured/50',
        // Phase 3: solid destructive button for confirm actions (delete, cancel tenancy).
        // The soft "destructive" variant above is unchanged.
        danger: 'bg-destructive text-white shadow-sm hover:bg-destructive/90 focus-visible:ring-destructive/40 dark:text-background',
      },
      size: {
        default: 'h-11 gap-2 px-5',
        xs: 'h-7 gap-1 rounded-lg px-2.5 text-xs',
        sm: 'h-9 gap-1.5 rounded-lg px-4 text-sm',
        lg: 'h-12 gap-2 px-6 text-base',
        icon: 'size-11',
        'icon-xs': 'size-7 rounded-lg',
        'icon-sm': 'size-9 rounded-lg',
        'icon-lg': 'size-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Phase 3: shows a spinner and disables the button. Off by default. */
  loading?: boolean;
}

function Button({ className, variant = 'default', size = 'default', asChild, loading = false, disabled, children, ...props }: ButtonProps) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}

export { Button, buttonVariants }
