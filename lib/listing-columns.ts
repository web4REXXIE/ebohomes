// The columns a landlord's own pages read from `listings`. It deliberately leaves out lat and lng:
// since Phase 10.5 Step F the database no longer lets the browser read the exact pin straight from the table.
// The owner reads their own pin through the listing_exact_location() function instead.
// Never use select('*') on listings in a page. If a page needs another column, add it here or in that page's own list.
export const OWNER_LISTING_COLUMNS =
  'id, landlord_id, title, description, location_text, price_monthly, service_charge, caution_deposit, property_type, bedrooms, bathrooms, amenities, photos, video_url, availability_date, status, authority_status, featured, created_at, reviewed_at, rejection_reason, suspension_reason, availability_confirmed_at, freshness_paused_at'
