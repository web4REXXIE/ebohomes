import { redirect } from 'next/navigation'

// Password reset now happens entirely on /forgot-password (email -> code -> new
// password). This route stays only so old emailed links don't 404.
export default function ResetPasswordPage() {
  redirect('/forgot-password')
}