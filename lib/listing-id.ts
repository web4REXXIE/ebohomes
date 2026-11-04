// Listing ids are UUIDs. Checking the shape first means a mistyped or malformed link shows
// "Listing not found" instead of a database error. Pure, so it can be unit tested.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidListingId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}
