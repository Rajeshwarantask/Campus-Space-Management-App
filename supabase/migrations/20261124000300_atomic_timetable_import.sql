BEGIN;

CREATE FUNCTION public.import_timetable_entries(p_term_id uuid, p_entries jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_entry jsonb;
  v_day smallint;
  v_period_number smallint;
  v_section_id uuid;
  v_subject_id uuid;
  v_faculty_id uuid;
  v_room_id uuid;
  v_period_id uuid;
  v_starts_at time;
  v_ends_at time;
  v_count integer := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'timetable_import_not_authorized';
  END IF;
  IF p_term_id IS NULL OR pg_catalog.jsonb_typeof(p_entries) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_entries) < 1
     OR pg_catalog.jsonb_array_length(p_entries) > 1000 THEN
    RAISE EXCEPTION 'timetable_import_invalid_batch';
  END IF;

  PERFORM 1 FROM public.academic_terms AS t WHERE t.id = p_term_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'timetable_import_term_not_found'; END IF;

  FOR v_entry IN SELECT element FROM pg_catalog.jsonb_array_elements(p_entries) AS items(element) LOOP
    v_day := (v_entry->>'day_of_week')::smallint;
    v_period_number := (v_entry->>'period')::smallint;
    v_section_id := (v_entry->>'section_id')::uuid;
    v_subject_id := (v_entry->>'subject_id')::uuid;
    v_faculty_id := (v_entry->>'faculty_id')::uuid;
    v_room_id := (v_entry->>'room_id')::uuid;

    IF v_day IS NULL OR v_day NOT BETWEEN 1 AND 7
       OR v_period_number IS NULL OR v_period_number NOT BETWEEN 1 AND 12
       OR v_section_id IS NULL OR v_subject_id IS NULL OR v_faculty_id IS NULL OR v_room_id IS NULL THEN
      RAISE EXCEPTION 'timetable_import_invalid_row';
    END IF;

    SELECT p.id, p.starts_at, p.ends_at INTO v_period_id, v_starts_at, v_ends_at
      FROM public.academic_periods AS p
     WHERE p.term_id = p_term_id AND p.period_number = v_period_number AND p.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'timetable_import_period_not_found'; END IF;

    PERFORM 1 FROM public.academic_sections AS s
     WHERE s.id = v_section_id AND s.term_id = p_term_id AND s.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'timetable_import_section_not_found'; END IF;
    PERFORM 1 FROM public.academic_subjects AS s WHERE s.id = v_subject_id AND s.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'timetable_import_subject_not_found'; END IF;
    PERFORM 1 FROM public.faculty_profiles AS f WHERE f.id = v_faculty_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'timetable_import_faculty_not_found'; END IF;
    PERFORM 1 FROM public.rooms AS r
     WHERE r.id = v_room_id AND r.is_active IS TRUE
       AND r.operational_status IS DISTINCT FROM 'retired';
    IF NOT FOUND THEN RAISE EXCEPTION 'timetable_import_room_not_found'; END IF;

    INSERT INTO public.timetable_entries (
      term_id, section_id, subject_id, academic_period_id, day_of_week, period,
      subject, faculty_id, room_id, starts_at, ends_at, is_active
    )
    SELECT p_term_id, v_section_id, v_subject_id, v_period_id, v_day, v_period_number,
           s.name, v_faculty_id, v_room_id, v_starts_at, v_ends_at, true
      FROM public.academic_subjects AS s WHERE s.id = v_subject_id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.import_timetable_entries(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_timetable_entries(uuid, jsonb) TO authenticated;

COMMIT;
