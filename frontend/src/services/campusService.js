import { supabase } from '../lib/supabase'

const roomFields = 'id,code,name,building,floor,capacity,equipment'
const bookingFields = 'id,room_id,title,purpose,starts_at,ends_at,status,confirmation_code,checked_in_at,user_id,booking_type'

export async function listRooms() {
  const { data, error } = await supabase.from('rooms').select(roomFields).order('code')
  return { data: data || [], error }
}

export async function listBookings() {
  const { data, error } = await supabase.from('bookings').select(bookingFields).order('starts_at', { ascending: true })
  return { data: data || [], error }
}

export async function reserveRoom({ roomId, title, purpose, startsAt, endsAt, bookingType = 'normal' }) {
  return supabase.rpc('reserve_booking', {
    p_room_id: roomId,
    p_title: title,
    p_purpose: purpose,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_booking_type: bookingType,
  })
}

export async function cancelReservation(id) {
  return supabase.rpc('cancel_booking', { p_booking_id: id })
}

export async function checkInReservation(confirmationCode) {
  return supabase.rpc('check_in_booking', { p_code: confirmationCode })
}
