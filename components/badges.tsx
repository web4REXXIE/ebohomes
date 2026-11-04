import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const cardVariants = cva('rounded-card border text-card-foreground', {
  variants: {
    tone: {
      default: 'border-border bg-card shadow-rest',
      cream: 'border-border bg-cream text-cream-foreground shadow-rest',
      // Forest has almost no contrast with the dark page, so it gets a visible border in dark mode.
      forest: 'border-forest bg-forest text-forest-foreground shadow-raised dark:border-border',
    },
    padding: {
      none: '',
      sm: 'p-3',
      default: 'p-card',
    },
    interactive: {
      true: 'transition-shadow duration-200 hover:shadow-raised focus-within:shadow-raised',
      false: '',
    },
  },
  defaultVariants: {
    tone: 'default',
    padding: 'default',
    interactive: false,
  },
})

interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

function Card({ className, tone, padding, interactive, ...props }: CardProps) {
  return <div data-slot="card" className={cn(cardVariants({ tone, padding, interactive }), className)} {...props} />
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-header" className={cn('flex flex-col gap-1', className)} {...props} />
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 data-slot="card-title" className={cn('text-lg font-semibold leading-snug', className)} {...props} />
}

function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p data-slot="card-description" className={cn('text-sm opacity-80', className)} {...props} />
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" className={cn('mt-3', className)} {...props} />
}

function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-footer" className={cn('mt-4 flex items-center gap-2', className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants }
