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
        // Verified, soft version for dense lists (the solid one above is for the main trust mark)
        'verified-soft': 'bg-verified-soft text-verified border-verified/20',
        // Status colours (Stage 4 tokens): dark text on the matching soft surface. Pair with an icon or label.
        success: 'bg-success-soft text-success border-success/20',
        warning: 'bg-warning-soft text-warning border-warning/25',
        error: 'bg-danger-soft text-danger border-danger/25',
        info: 'bg-info-soft text-info border-info/25',
        pending: 'bg-pending-soft text-pending border-pending/25',
        unverified: 'bg-unverified-soft text-unverified border-border',
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
