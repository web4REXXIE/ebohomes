'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { cleanDescription } from '@/lib/clean-description';

const LocationPickerModal = dynamic(
  () => import('@/components/location-picker-modal').then((mod) => ({ default: mod.LocationPickerModal })),
  { ssr: false }
);

const PROPERTY_TYPES = [
  'Flat / Apartment',
  'Bungalow',
  'Duplex',
  'Self Contain',
  'Penthouse',
  'Hostel',
  'Office',
  'Shop / Mall',
  'Warehouse',
  'Land / Plot',
  'Event Center',
];

const inputCls = 'focus-ring w-full min-h-12 rounded-lg border border-border bg-input px-3 py-2.5 text-base';
const labelCls = 'mb-1 block text-sm font-semibold text-foreground';

type Errors = Partial<Record<'location' | 'propertyType' | 'bedrooms' | 'monthlyRent' | 'phoneNumber', string>>;

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [showMap, setShowMap] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);

  const [formData, setFormData] = useState({
    location: '',
    propertyType: '',
    bedrooms: '',
    monthlyRent: '',
    description: '',
    phoneNumber: '',
    availabilityDate: '',
  });

  useEffect(() => {
    const fetchListing = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setMessage('You must be logged in to edit a listing.');
        setLoadFailed(true);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('listings')
        .select('id, location_text, property_type, bedrooms, price_monthly, description, availability_date')
        .eq('id', id)
        .eq('landlord_id', user.id)
        .single();

      const { data: contactRow } = await supabase
        .from('listing_contacts')
        .select('contact_info')
        .eq('listing_id', id)
        .maybeSingle();

      if (error || !data) {
        setMessage('Could not load this listing.');
        setLoadFailed(true);
        setLoading(false);
        return;
      }

      setFormData({
        location: data.location_text || '',
        propertyType: data.property_type || '',
        bedrooms: data.bedrooms ? String(data.bedrooms) : '',
        monthlyRent: data.price_monthly ? String(data.price_monthly) : '',
        description: data.description || '',
        phoneNumber: contactRow?.contact_info ?? '',
        availabilityDate: data.availability_date || '',
      });

      // The exact pin is not readable from the table any more. The owner gets their own pin from this function.
      const { data: exact } = await supabase.rpc('listing_exact_location', { p_listing: id });
      if (exact && exact.lat != null && exact.lng != null) {
        const lat = Number(exact.lat);
        const lng = Number(exact.lng);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) setPin({ lat, lng });
      }

      setLoading(false);
    };
    fetchListing();
  }, [id]);

  const set = (k: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setFormData((p) => ({ ...p, [k]: e.target.value }));

  const validate = (): Errors => {
    const e: Errors = {};
    if (!formData.location.trim()) e.location = 'Enter the neighbourhood or area.';
    if (!formData.propertyType) e.propertyType = 'Choose a property type.';
    if (!formData.bedrooms) e.bedrooms = 'Choose the number of bedrooms.';
    if (!formData.monthlyRent || !(Number(formData.monthlyRent) > 0)) e.monthlyRent = 'Enter the monthly rent.';
    if (!formData.phoneNumber.trim()) e.phoneNumber = 'Enter a phone number.';
    return e;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setMessage('');
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setMessage('Please fix the highlighted fields.');
      return;
    }
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setMessage('You must be logged in to save changes.');
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from('listings')
      .update({
        title: `${formData.bedrooms} bed ${formData.propertyType} in ${formData.location}`,
        location_text: formData.location,
        lat: pin ? pin.lat : null,
        lng: pin ? pin.lng : null,
        property_type: formData.propertyType,
        bedrooms: Number(formData.bedrooms),
        price_monthly: Number(formData.monthlyRent),
        description: cleanDescription(formData.description),
        contact_info: formData.phoneNumber,
        availability_date: formData.availabilityDate || null,
      })
      .eq('id', id)
      .eq('landlord_id', user.id);

    setSaving(false);

    if (error) {
      setMessage('Failed to save: ' + error.message);
      return;
    }

    router.push('/dashboard');
  };

  const fieldErr = (k: keyof Errors) =>
    errors[k] ? <p id={`edit-${k}-err`} role="alert" className="mt-1 text-xs font-medium text-danger">{errors[k]}</p> : null;
  const aria = (k: keyof Errors) => ({ 'aria-invalid': !!errors[k], 'aria-describedby': errors[k] ? `edit-${k}-err` : undefined });

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading">
        <Loader2 className="animate-spin text-primary" size={28} aria-hidden />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-4">
        <h1 className="text-xl font-bold text-foreground">Edit listing</h1>
        <p role="alert" className="rounded-card border border-danger/30 bg-danger-soft p-3 text-sm font-medium text-danger">{message}</p>
        <Link href="/dashboard/listings" className="focus-ring flex min-h-12 items-center justify-center rounded-button bg-primary px-4 font-bold text-primary-foreground">Back to My Properties</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <h1 className="text-xl font-bold text-foreground">Edit listing</h1>
      <p className="mb-4 text-sm text-muted-foreground">Update the details tenants see. Photos are not changed here.</p>

      <form onSubmit={handleSave} noValidate className="space-y-4">
        <section className="space-y-4 rounded-card border border-border bg-card p-4 shadow-rest" aria-label="Property details">
          <div>
            <label htmlFor="edit-type" className={labelCls}>Property type</label>
            <select id="edit-type" value={formData.propertyType} onChange={set('propertyType')} className={inputCls} {...aria('propertyType')}>
              <option value="">Select type</option>
              {PROPERTY_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            {fieldErr('propertyType')}
          </div>

          <div>
            <label htmlFor="edit-beds" className={labelCls}>Bedrooms</label>
            <select id="edit-beds" value={formData.bedrooms} onChange={set('bedrooms')} className={inputCls} {...aria('bedrooms')}>
              <option value="">Select bedrooms</option>
              {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                <option key={num} value={num}>{num}</option>
              ))}
            </select>
            {fieldErr('bedrooms')}
          </div>

          <div>
            <label htmlFor="edit-desc" className={labelCls}>Description</label>
            <textarea id="edit-desc" value={formData.description} onChange={set('description')} rows={5} className={`${inputCls} resize-y`} />
          </div>
        </section>

        <section className="space-y-4 rounded-card border border-border bg-card p-4 shadow-rest" aria-label="Location">
          <div>
            <label htmlFor="edit-location" className={labelCls}>Neighbourhood / area</label>
            <input id="edit-location" value={formData.location} onChange={set('location')} className={inputCls} autoComplete="off" {...aria('location')} />
            {fieldErr('location')}
          </div>

          <div>
            <span className={labelCls}>Map location</span>
            <button
              type="button"
              onClick={() => setShowMap(true)}
              className="focus-ring flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card px-3 font-bold text-primary"
            >
              <MapPin size={16} aria-hidden />
              {pin ? 'Pin set. Tap to change it' : 'Drop a pin on the map'}
            </button>
            {pin && (
              <p className="mt-1.5 text-xs text-muted-foreground">Pin: {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</p>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-card border border-border bg-card p-4 shadow-rest" aria-label="Price and contact">
          <div>
            <label htmlFor="edit-rent" className={labelCls}>Monthly rent (₦)</label>
            <input id="edit-rent" type="number" inputMode="numeric" min={0} value={formData.monthlyRent} onChange={set('monthlyRent')} className={inputCls} {...aria('monthlyRent')} />
            {fieldErr('monthlyRent')}
          </div>

          <div>
            <label htmlFor="edit-phone" className={labelCls}>Phone number</label>
            <input id="edit-phone" type="tel" autoComplete="tel" value={formData.phoneNumber} onChange={set('phoneNumber')} className={inputCls} {...aria('phoneNumber')} />
            {fieldErr('phoneNumber')}
          </div>

          <div>
            <label htmlFor="edit-date" className={labelCls}>Availability date</label>
            <input id="edit-date" type="date" value={formData.availabilityDate} onChange={set('availabilityDate')} className={inputCls} />
          </div>
        </section>

        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 space-y-2 border-t border-border bg-card px-4 py-3 sm:-mx-6 sm:px-6 md:bottom-0">
          {message && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-2.5 text-sm font-medium text-danger">{message}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="focus-ring flex min-h-12 flex-1 items-center justify-center gap-2 rounded-button bg-primary px-4 font-bold text-primary-foreground disabled:opacity-60"
            >
              {saving ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Saving...</> : 'Save changes'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => router.push('/dashboard')}
              className="focus-ring min-h-12 flex-1 rounded-button border border-border bg-card px-4 font-semibold text-foreground disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>

      {showMap && (
        <LocationPickerModal
          initial={pin}
          onClose={() => setShowMap(false)}
          onConfirm={(lat, lng) => {
            setPin({ lat, lng });
            setShowMap(false);
          }}
        />
      )}
    </div>
  );
}
