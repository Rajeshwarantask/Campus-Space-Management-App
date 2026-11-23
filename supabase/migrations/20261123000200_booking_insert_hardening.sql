BEGIN;

REVOKE INSERT ON TABLE public.bookings FROM authenticated;
DROP POLICY IF EXISTS bookings_owner_insert ON public.bookings;

REVOKE EXECUTE ON FUNCTION public.approve_booking_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_booking_request(uuid, text, text) TO authenticated;

COMMIT;
