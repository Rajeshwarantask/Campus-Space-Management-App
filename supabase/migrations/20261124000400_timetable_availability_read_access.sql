BEGIN;

-- Availability is computed from the canonical timetable and faculty identity records.
-- Authenticated campus users need read-only access; writes remain administrator-only.
GRANT SELECT ON TABLE public.timetable_entries TO authenticated;

CREATE POLICY timetable_entries_authenticated_read
  ON public.timetable_entries
  FOR SELECT TO authenticated
  USING (true);

CREATE VIEW public.faculty_directory AS
  SELECT id, display_name FROM public.faculty_profiles;
GRANT SELECT ON public.faculty_directory TO authenticated;

COMMIT;
