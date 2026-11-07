'use client';
import { useEffect, useState } from 'react';
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

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

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

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 20 }}>Edit Listing</h1>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Neighborhood/Area</label>
          <input
            value={formData.location}
            onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
            style={inputStyle}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>Map location</label>
          <button
            type="button"
            onClick={() => setShowMap(true)}
            style={{
              width: '100%', padding: 14, borderRadius: 8, cursor: 'pointer',
              border: '2px dashed #d1d5db', background: '#fff', color: '#16a34a',
              fontWeight: 700, fontSize: 14,
            }}
          >
            {pin ? 'Pin set. Tap to change it' : 'Drop a pin on the map'}
          </button>
          {pin && (
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
              Pin: {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
            </p>
          )}
        </div>

        <div>
          <label style={labelStyle}>Property Type</label>
          <select
            value={formData.propertyType}
            onChange={(e) => setFormData((p) => ({ ...p, propertyType: e.target.value }))}
            style={inputStyle}
            required
          >
            <option value="">Select type</option>
            {PROPERTY_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Bedrooms</label>
          <select
            value={formData.bedrooms}
            onChange={(e) => setFormData((p) => ({ ...p, bedrooms: e.target.value }))}
            style={inputStyle}
            required
          >
            <option value="">Select bedrooms</option>
            {[1, 2, 3, 4, 5, 6, 7].map((num) => (
              <option key={num} value={num}>{num}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Monthly Rent (₦)</label>
          <input
            type="number"
            value={formData.monthlyRent}
            onChange={(e) => setFormData((p) => ({ ...p, monthlyRent: e.target.value }))}
            style={inputStyle}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
            rows={4}
            style={{ ...inputStyle, resize: 'none' }}
          />
        </div>

        <div>
          <label style={labelStyle}>Phone Number</label>
          <input
            type="tel"
            value={formData.phoneNumber}
            onChange={(e) => setFormData((p) => ({ ...p, phoneNumber: e.target.value }))}
            style={inputStyle}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>Availability Date</label>
          <input
            type="date"
            value={formData.availabilityDate}
            onChange={(e) => setFormData((p) => ({ ...p, availabilityDate: e.target.value }))}
            style={inputStyle}
          />
        </div>

        {message && <p style={{ color: '#dc2626', fontSize: 13 }}>{message}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              flex: 1, padding: 12, background: '#16a34a', color: '#fff',
              border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            style={{
              flex: 1, padding: 12, background: '#f3f4f6', border: 'none',
              borderRadius: 8, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
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

const labelStyle: React.CSSProperties = {
  fontWeight: 700, fontSize: 13, color: '#374151', display: 'block', marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: 8,
  border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box',
};
