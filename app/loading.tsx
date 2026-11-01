export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading">
      <img
        src="/logo-header.png"
        alt=""
        className="h-10 w-auto animate-pulse dark:brightness-0 dark:invert"
      />
    </div>
  )
}