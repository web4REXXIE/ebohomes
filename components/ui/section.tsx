import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const sectionVariants = cva('w-full', {
  variants: {
    tone: {
      default: '',
      cream: 'bg-cream text-cream-foreground',
      muted: 'bg-muted/40',
      forest: 'bg-forest text-forest-foreground dark:border-y dark:border-border',
    },
    spacing: {
      default: 'py-section',
      sm: 'py-section-sm',
      none: '',
    },
  },
  defaultVariants: {
    tone: 'default',
    spacing: 'default',
  },
})

// Matches the Phase 2 container utilities in app/globals.css.
const widthClass = {
  wide: 'container-wide',
  content: 'container-content',
  reading: 'container-reading',
  narrow: 'container-narrow',
} as const

type SectionElement = 'section' | 'div' | 'header' | 'footer' | 'article' | 'aside'

interface SectionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'>, VariantProps<typeof sectionVariants> {
  as?: SectionElement
  width?: keyof typeof widthClass
  /** Classes for the inner container (the outer element takes `className`). */
  containerClassName?: string
  children?: React.ReactNode
}

function Section({ as: Tag = 'section', tone, spacing, width = 'content', className, containerClassName, children, ...props }: SectionProps) {
  return (
    <Tag data-slot="section" className={cn(sectionVariants({ tone, spacing }), className)} {...props}>
      <div className={cn(widthClass[width], containerClassName)}>{children}</div>
    </Tag>
  )
}

/** Just the centred, gutter-padded container, with no background or vertical padding. */
function Container({ width = 'content', className, ...props }: React.HTMLAttributes<HTMLDivElement> & { width?: keyof typeof widthClass }) {
  return <div data-slot="container" className={cn(widthClass[width], className)} {...props} />
}

export { Section, Container, sectionVariants }
