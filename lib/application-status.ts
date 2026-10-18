// Maps the EXISTING applications.status values to the agreed workflow wording.
// No new status values are introduced. Where the agreed workflow has a stage the database does not
// model (Under Review vs Submitted, Awaiting Landlord Decision) it is derived or left unmapped, never faked.
//
// DB status        -> agreed stage
// pending          -> Submitted / Under Review (EboHomes checks it; landlord only adds a recommendation)
// info_requested   -> More Information Required
// approved         -> Approved
// rejected         -> Rejected
// withdrawn        -> Withdrawn
// (no equivalent)  -> Awaiting Landlord Decision: in the current model EboHomes decides and the landlord
//                     only recommends, so this stage is not a status. Adding it needs a product decision.

export type ApplicationStage =
  | 'submitted'
  | 'under_review'
  | 'more_information_required'
  | 'approved'
  | 'rejected'
  | 'withdrawn'

export function applicationStage(a: { status: string; landlord_recommendation?: string | null }): ApplicationStage {
  switch (a.status) {
    case 'info_requested': return 'more_information_required'
    case 'approved': return 'approved'
    case 'rejected': return 'rejected'
    case 'withdrawn': return 'withdrawn'
    default:
      // A landlord recommendation only exists once EboHomes has passed the application on.
      return a.landlord_recommendation ? 'under_review' : 'submitted'
  }
}

export const STAGE_LABEL: Record<ApplicationStage, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  more_information_required: 'More information required',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

export function existingApplicationMessage(status: string): string {
  if (status === 'approved')
    return 'EboHomes has approved your application for this property. Open your applications to see the next step. Approval does not reserve the property or create a tenancy.'
  if (status === 'info_requested')
    return 'EboHomes has asked you for more information about your application. Open your applications to answer.'
  return 'Your application for this property has been submitted and EboHomes is reviewing it.'
}

// Badge styling per stage, using existing theme tokens only (UI only).
export const STAGE_TONE: Record<ApplicationStage, string> = {
  submitted: 'text-accent-foreground bg-accent border-primary/20',
  under_review: 'text-accent-foreground bg-accent border-primary/20',
  more_information_required: 'text-amber-800 bg-amber-100 border-amber-300',
  approved: 'text-primary-foreground bg-primary border-primary',
  rejected: 'text-destructive bg-destructive/10 border-destructive/30',
  withdrawn: 'text-muted-foreground bg-secondary border-border',
}

// One-line plain-English meaning of each stage, for staff and landlord screens.
export const STAGE_HELP: Record<ApplicationStage, string> = {
  submitted: 'Received. EboHomes is checking it is complete.',
  under_review: 'EboHomes is reviewing, with a landlord recommendation on file.',
  more_information_required: 'EboHomes asked the tenant a question and is waiting for the answer.',
  approved: 'Approved by EboHomes. This is not a viewing, payment, reservation or tenancy.',
  rejected: 'Declined by EboHomes.',
  withdrawn: 'Withdrawn by the tenant.',
}