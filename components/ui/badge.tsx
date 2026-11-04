import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 rounded-full border border-transparent font-semibold whitespace-nowrap [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Verification: white on brand green (5.44:1)
        verified: 'bg-primary text-primary-foreground',
        // Featured: dark brown on gold (about 7:1)
        featured: 'bg-featured text-featured-foreground',
        // Status colours: tinted background with a dark text colour
        success: 'bg-accent text-accent-foreground border-primary/20',
        warning: 'bg-featured/15 text-featured-foreground border-featured/40 dark:text-featured',
        error: 'bg-destructive/10 text-[color-mix(in_oklab,var(--destructive),black_25%)] border-destructive/30 dark:text-destructive',
        // Neutral category / label
        neutral: 'bg-secondary text-secondary-foreground border-border',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs [&_svg]:size-3',
        md: 'px-3 py-1 text-xs [&_svg]:size-3.5',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'md',
    },
  },
)

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant, size }), className)} {...props} />
}

export { Badge, badgeVariants }
