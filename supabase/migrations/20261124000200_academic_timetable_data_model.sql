BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_years_valid_dates CHECK (ends_on >= starts_on),
  CONSTRAINT academic_years_no_date_overlap EXCLUDE USING gist (
    daterange(starts_on, ends_on, '[]') WITH &&
  )
);
CREATE UNIQUE INDEX academic_years_single_active_idx
  ON public.academic_years ((status)) WHERE status = 'active';

CREATE TABLE public.academic_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (btrim(name) <> ''),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_terms_valid_dates CHECK (ends_on >= starts_on),
  CONSTRAINT academic_terms_id_year_unique UNIQUE (id, academic_year_id),
  CONSTRAINT academic_terms_no_date_overlap EXCLUDE USING gist (
    academic_year_id WITH =,
    daterange(starts_on, ends_on, '[]') WITH &&
  )
);
CREATE UNIQUE INDEX academic_terms_single_active_idx
  ON public.academic_terms ((status)) WHERE status = 'active';
CREATE INDEX academic_terms_academic_year_idx ON public.academic_terms (academic_year_id);

CREATE FUNCTION public.enforce_academic_term_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_year_start date;
  v_year_end date;
BEGIN
  IF NEW.ends_on < NEW.starts_on THEN
    RAISE EXCEPTION 'academic_term_invalid_date_range';
  END IF;

  SELECT y.starts_on, y.ends_on
    INTO v_year_start, v_year_end
    FROM public.academic_years AS y
   WHERE y.id = NEW.academic_year_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'academic_year_not_found';
  END IF;

  IF NOT (pg_catalog.daterange(NEW.starts_on, NEW.ends_on, '[]') <@
          pg_catalog.daterange(v_year_start, v_year_end, '[]')) THEN
    RAISE EXCEPTION 'academic_term_outside_academic_year';
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_academic_term_dates() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER academic_terms_dates_guard
  BEFORE INSERT OR UPDATE OF academic_year_id, starts_on, ends_on
  ON public.academic_terms
  FOR EACH ROW EXECUTE FUNCTION public.enforce_academic_term_dates();

CREATE FUNCTION public.enforce_academic_year_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.ends_on < NEW.starts_on THEN
    RAISE EXCEPTION 'academic_year_invalid_date_range';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.academic_terms AS t
     WHERE t.academic_year_id = NEW.id
       AND NOT (pg_catalog.daterange(t.starts_on, t.ends_on, '[]') <@
                pg_catalog.daterange(NEW.starts_on, NEW.ends_on, '[]'))
  ) THEN
    RAISE EXCEPTION 'academic_year_change_excludes_existing_term';
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_academic_year_dates() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER academic_years_dates_guard
  BEFORE UPDATE OF starts_on, ends_on
  ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION public.enforce_academic_year_dates();

CREATE TABLE public.academic_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL,
  term_id uuid NOT NULL,
  code text NOT NULL CHECK (btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  year_of_study smallint CHECK (year_of_study BETWEEN 1 AND 10),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_sections_term_year_fkey
    FOREIGN KEY (term_id, academic_year_id)
    REFERENCES public.academic_terms(id, academic_year_id) ON DELETE RESTRICT,
  CONSTRAINT academic_sections_term_code_unique UNIQUE (term_id, code),
  CONSTRAINT academic_sections_id_term_unique UNIQUE (id, term_id)
);
CREATE INDEX academic_sections_academic_year_idx ON public.academic_sections (academic_year_id);
CREATE INDEX academic_sections_term_idx ON public.academic_sections (term_id);

CREATE TABLE public.academic_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE CHECK (code IS NULL OR btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  department text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX academic_subjects_normalized_name_uidx
  ON public.academic_subjects (lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')));

CREATE TABLE public.faculty_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  staff_identifier text UNIQUE CHECK (staff_identifier IS NULL OR btrim(staff_identifier) <> ''),
  department text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.academic_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id uuid NOT NULL REFERENCES public.academic_terms(id) ON DELETE RESTRICT,
  period_number smallint NOT NULL CHECK (period_number BETWEEN 1 AND 12),
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_periods_valid_window CHECK (ends_at > starts_at),
  CONSTRAINT academic_periods_term_number_unique UNIQUE (term_id, period_number),
  CONSTRAINT academic_periods_id_term_unique UNIQUE (id, term_id),
  CONSTRAINT academic_periods_no_time_overlap EXCLUDE USING gist (
    term_id WITH =,
    (pg_catalog.tsrange(DATE '2000-01-03' + starts_at, DATE '2000-01-03' + ends_at, '[)')) WITH &&
  )
);
CREATE INDEX academic_periods_term_idx ON public.academic_periods (term_id);

CREATE TABLE public.timetable_completeness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id uuid NOT NULL REFERENCES public.academic_terms(id) ON DELETE RESTRICT,
  scope_type text NOT NULL CHECK (scope_type IN ('institution', 'section')),
  section_id uuid,
  status text NOT NULL DEFAULT 'not_configured'
    CHECK (status IN ('not_configured', 'in_progress', 'complete', 'published')),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CONSTRAINT timetable_completeness_scope_valid CHECK (
    (scope_type = 'institution' AND section_id IS NULL) OR
    (scope_type = 'section' AND section_id IS NOT NULL)
  ),
  CONSTRAINT timetable_completeness_section_term_fkey
    FOREIGN KEY (section_id, term_id)
    REFERENCES public.academic_sections(id, term_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX timetable_completeness_institution_scope_uidx
  ON public.timetable_completeness (term_id) WHERE scope_type = 'institution';
CREATE UNIQUE INDEX timetable_completeness_section_scope_uidx
  ON public.timetable_completeness (term_id, section_id) WHERE scope_type = 'section';

ALTER TABLE public.rooms
  ADD COLUMN category text,
  ADD CONSTRAINT rooms_category_valid CHECK (category IS NULL OR category IN ('classroom', 'laboratory'));

ALTER TABLE public.timetable_entries
  ADD COLUMN term_id uuid,
  ADD COLUMN section_id uuid,
  ADD COLUMN subject_id uuid,
  ADD COLUMN academic_period_id uuid,
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD CONSTRAINT timetable_entries_term_fkey
    FOREIGN KEY (term_id) REFERENCES public.academic_terms(id) ON DELETE RESTRICT,
  ADD CONSTRAINT timetable_entries_section_term_fkey
    FOREIGN KEY (section_id, term_id)
    REFERENCES public.academic_sections(id, term_id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT timetable_entries_subject_fkey
    FOREIGN KEY (subject_id) REFERENCES public.academic_subjects(id) ON DELETE RESTRICT,
  ADD CONSTRAINT timetable_entries_period_term_fkey
    FOREIGN KEY (academic_period_id, term_id)
    REFERENCES public.academic_periods(id, term_id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT timetable_entries_faculty_profile_fkey
    FOREIGN KEY (faculty_id) REFERENCES public.faculty_profiles(id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT timetable_entries_academic_links_required CHECK (
    term_id IS NOT NULL AND section_id IS NOT NULL AND
    subject_id IS NOT NULL AND academic_period_id IS NOT NULL
  ) NOT VALID;

CREATE INDEX timetable_entries_term_idx ON public.timetable_entries (term_id);
CREATE INDEX timetable_entries_section_term_idx ON public.timetable_entries (section_id, term_id);
CREATE INDEX timetable_entries_subject_idx ON public.timetable_entries (subject_id);
CREATE INDEX timetable_entries_period_term_idx ON public.timetable_entries (academic_period_id, term_id);

CREATE FUNCTION public.enforce_timetable_academic_references()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_subject_name text;
  v_period_number smallint;
  v_period_start time;
  v_period_end time;
  v_period_active boolean;
BEGIN
  IF NEW.term_id IS NULL AND NEW.section_id IS NULL AND NEW.subject_id IS NULL AND NEW.academic_period_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.term_id IS NULL OR NEW.section_id IS NULL OR NEW.subject_id IS NULL OR NEW.academic_period_id IS NULL THEN
    RAISE EXCEPTION 'timetable_academic_links_required';
  END IF;

  SELECT s.name INTO v_subject_name
    FROM public.academic_subjects AS s
   WHERE s.id = NEW.subject_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'timetable_subject_not_found';
  END IF;
  NEW.subject := v_subject_name;

  SELECT p.period_number, p.starts_at, p.ends_at, p.is_active
    INTO v_period_number, v_period_start, v_period_end, v_period_active
    FROM public.academic_periods AS p
   WHERE p.id = NEW.academic_period_id
     AND p.term_id = NEW.term_id;
  IF NOT FOUND OR NOT v_period_active THEN
    RAISE EXCEPTION 'timetable_period_not_available';
  END IF;
  IF NEW.period IS DISTINCT FROM v_period_number OR
     NEW.starts_at IS DISTINCT FROM v_period_start OR
     NEW.ends_at IS DISTINCT FROM v_period_end THEN
    RAISE EXCEPTION 'timetable_period_definition_mismatch';
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_timetable_academic_references() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER timetable_entries_academic_references_guard
  BEFORE INSERT OR UPDATE OF term_id, section_id, subject_id, academic_period_id, period, starts_at, ends_at
  ON public.timetable_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_timetable_academic_references();

CREATE FUNCTION public.prevent_used_academic_period_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF ROW(NEW.term_id, NEW.period_number, NEW.starts_at, NEW.ends_at)
       IS DISTINCT FROM ROW(OLD.term_id, OLD.period_number, OLD.starts_at, OLD.ends_at)
     AND EXISTS (
       SELECT 1 FROM public.timetable_entries AS t
        WHERE t.academic_period_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'academic_period_in_use';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.prevent_used_academic_period_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER academic_periods_used_definition_guard
  BEFORE UPDATE OF term_id, period_number, starts_at, ends_at
  ON public.academic_periods
  FOR EACH ROW EXECUTE FUNCTION public.prevent_used_academic_period_change();

ALTER TABLE public.timetable_entries
  ADD CONSTRAINT timetable_room_no_overlap EXCLUDE USING gist (
    term_id WITH =,
    day_of_week WITH =,
    room_id WITH =,
    (pg_catalog.tsrange(DATE '2000-01-03' + starts_at, DATE '2000-01-03' + ends_at, '[)')) WITH &&
  ) WHERE (is_active AND term_id IS NOT NULL),
  ADD CONSTRAINT timetable_faculty_no_overlap EXCLUDE USING gist (
    term_id WITH =,
    day_of_week WITH =,
    faculty_id WITH =,
    (pg_catalog.tsrange(DATE '2000-01-03' + starts_at, DATE '2000-01-03' + ends_at, '[)')) WITH &&
  ) WHERE (is_active AND term_id IS NOT NULL),
  ADD CONSTRAINT timetable_section_no_overlap EXCLUDE USING gist (
    term_id WITH =,
    day_of_week WITH =,
    section_id WITH =,
    (pg_catalog.tsrange(DATE '2000-01-03' + starts_at, DATE '2000-01-03' + ends_at, '[)')) WITH &&
  ) WHERE (is_active AND term_id IS NOT NULL);

ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_completeness ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.academic_years, public.academic_terms, public.academic_sections,
  public.academic_subjects, public.faculty_profiles, public.academic_periods,
  public.timetable_completeness FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.academic_years, public.academic_terms,
  public.academic_sections, public.academic_subjects, public.faculty_profiles,
  public.academic_periods, public.timetable_completeness TO authenticated;

CREATE POLICY academic_years_authenticated_read ON public.academic_years
  FOR SELECT TO authenticated USING (true);
CREATE POLICY academic_years_admin_manage ON public.academic_years
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY academic_terms_authenticated_read ON public.academic_terms
  FOR SELECT TO authenticated USING (true);
CREATE POLICY academic_terms_admin_manage ON public.academic_terms
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY academic_sections_authenticated_read ON public.academic_sections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY academic_sections_admin_manage ON public.academic_sections
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY academic_subjects_authenticated_read ON public.academic_subjects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY academic_subjects_admin_manage ON public.academic_subjects
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY faculty_profiles_admin_manage ON public.faculty_profiles
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY academic_periods_authenticated_read ON public.academic_periods
  FOR SELECT TO authenticated USING (true);
CREATE POLICY academic_periods_admin_manage ON public.academic_periods
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY timetable_completeness_authenticated_read ON public.timetable_completeness
  FOR SELECT TO authenticated USING (true);
CREATE POLICY timetable_completeness_admin_manage ON public.timetable_completeness
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMIT;
