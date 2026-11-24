BEGIN;

DROP POLICY IF EXISTS bookings_authenticated_read ON public.bookings;
CREATE POLICY bookings_owner_or_admin_read
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS bookings_owner_update ON public.bookings;
REVOKE UPDATE ON TABLE public.bookings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_booking public.bookings;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT b.*
    INTO v_booking
    FROM public.bookings AS b
   WHERE b.id = p_booking_id
     AND b.user_id = auth.uid()
   FOR UPDATE;

  IF v_booking.id IS NULL OR v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'booking_not_cancellable';
  END IF;

  UPDATE public.bookings AS b
     SET status = 'cancelled', updated_at = pg_catalog.now()
   WHERE b.id = v_booking.id
   RETURNING b.* INTO v_booking;

  RETURN v_booking;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;

ALTER FUNCTION public.search_room_availability(timestamptz, timestamptz, integer, text[], text, text) SECURITY DEFINER;
ALTER FUNCTION public.search_room_availability(timestamptz, timestamptz, integer, text[], text, text) SET search_path = '';
ALTER FUNCTION public.reserve_booking(uuid, text, text, timestamptz, timestamptz, text) SECURITY DEFINER;
ALTER FUNCTION public.reserve_booking(uuid, text, text, timestamptz, timestamptz, text) SET search_path = '';
ALTER FUNCTION public.check_in_booking(text) SECURITY DEFINER;
ALTER FUNCTION public.check_in_booking(text) SET search_path = '';

CREATE OR REPLACE FUNCTION public.approve_booking_request(
  p_request_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS public.booking_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_request public.booking_requests;
  v_booking public.bookings;
  v_policy public.booking_policies;
  v_room public.rooms;
  v_local_start timestamp;
  v_local_end timestamp;
  v_code text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT r.* INTO v_request
    FROM public.booking_requests AS r
   WHERE r.id = p_request_id
   FOR UPDATE;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request_already_decided';
  END IF;

  IF p_decision = 'rejected' THEN
    UPDATE public.booking_requests AS r
       SET status = 'rejected',
           decision_reason = pg_catalog.nullif(pg_catalog.btrim(p_reason), ''),
           decided_by = auth.uid(),
           decided_at = pg_catalog.now()
     WHERE r.id = v_request.id
     RETURNING r.* INTO v_request;
    RETURN v_request;
  END IF;
  IF p_decision <> 'approved' THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  SELECT p.* INTO v_policy FROM public.booking_policies AS p WHERE p.id = true;
  v_local_start := v_request.starts_at AT TIME ZONE v_policy.timezone;
  v_local_end := v_request.ends_at AT TIME ZONE v_policy.timezone;
  IF v_request.ends_at <= v_request.starts_at OR v_request.starts_at < pg_catalog.now() THEN
    RAISE EXCEPTION 'invalid_window';
  END IF;

  SELECT r.* INTO v_room
    FROM public.rooms AS r
   WHERE r.id = v_request.room_id
   FOR UPDATE;
  IF v_room.id IS NULL OR NOT v_room.is_active OR v_room.operational_status <> 'available' THEN
    RAISE EXCEPTION 'room_unavailable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.room_closures AS c
     WHERE c.room_id = v_request.room_id
       AND pg_catalog.tstzrange(c.starts_at, c.ends_at, '[)') && pg_catalog.tstzrange(v_request.starts_at, v_request.ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'room_closed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.timetable_entries AS t
     WHERE t.room_id = v_request.room_id
       AND t.day_of_week = extract(isodow FROM v_local_start)::integer
       AND t.starts_at < v_local_end::time
       AND t.ends_at > v_local_start::time
  ) THEN
    RAISE EXCEPTION 'timetable_conflict';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bookings AS b
     WHERE b.room_id = v_request.room_id
       AND b.status IN ('confirmed', 'checked_in')
       AND pg_catalog.tstzrange(b.starts_at, b.ends_at, '[)') && pg_catalog.tstzrange(v_request.starts_at, v_request.ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'room_conflict';
  END IF;

  v_code := 'CLS-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 6));
  INSERT INTO public.bookings (room_id, user_id, title, purpose, starts_at, ends_at, confirmation_code, booking_type, status, updated_at)
  VALUES (v_request.room_id, v_request.user_id, v_request.title, v_request.purpose, v_request.starts_at, v_request.ends_at, v_code, CASE WHEN v_request.category = 'emergency' THEN 'emergency' ELSE 'normal' END, 'confirmed', pg_catalog.now())
  RETURNING * INTO v_booking;

  UPDATE public.booking_requests AS r
     SET status = 'approved', decided_by = auth.uid(), decided_at = pg_catalog.now()
   WHERE r.id = v_request.id
   RETURNING r.* INTO v_request;
  INSERT INTO public.admin_audit_events (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'approve_request', 'booking_request', v_request.id, pg_catalog.jsonb_build_object('booking_id', v_booking.id));
  RETURN v_request;
EXCEPTION WHEN exclusion_violation THEN
  RAISE EXCEPTION 'room_conflict';
END;
$function$;

COMMIT;
