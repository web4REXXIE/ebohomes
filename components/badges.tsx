import { CheckCircle, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export function VerifiedBadge() {
  return (
    <Badge variant="verified">
      <CheckCircle aria-hidden="true" />
      Verified
    </Badge>
  )
}

export function FeaturedBadge() {
  return <Badge variant="featured">Featured</Badge>
}

// Phase 3: for listings or landlords that are still under review.
export function PendingVerificationBadge() {
  return (
    <Badge variant="warning">
      <Clock aria-hidden="true" />
      Pending review
    </Badge>
  )
}
