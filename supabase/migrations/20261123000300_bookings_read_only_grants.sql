BEGIN;

REVOKE ALL ON TABLE public.bookings FROM anon, authenticated;
GRANT SELECT ON TABLE public.bookings TO authenticated;

COMMIT;
