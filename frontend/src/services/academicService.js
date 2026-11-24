import { supabase } from '../lib/supabase';

const missingSchemaCodes = new Set(['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205']);

export function isAcademicSchemaMissing(error) {
  const message = String(error?.message || '').toLowerCase();
  return missingSchemaCodes.has(error?.code) || message.includes('does not exist') || message.includes('schema cache');
}

export function academicSchemaMessage(error) {
  if (isAcademicSchemaMissing(error)) {
    return 'Academic management is waiting for its database migration. No academic data was changed.';
  }
  return 'Academic data could not be loaded. Check the migration deployment and administrator permissions, then retry.';
}

export async function loadAcademicData(includeFacultyProfiles) {
  const probe = await supabase.from('academic_years').select('id').limit(1);
  if (probe.error) {
    return { available: false, error: academicSchemaMessage(probe.error), schemaMissing: isAcademicSchemaMissing(probe.error), data: emptyAcademicData() };
  }

  const queries = [
    ['years', supabase.from('academic_years').select('id,name,starts_on,ends_on,status,created_at').order('starts_on', { ascending: false })],
    ['terms', supabase.from('academic_terms').select('id,academic_year_id,name,starts_on,ends_on,status,created_at').order('starts_on')],
    ['sections', supabase.from('academic_sections').select('id,academic_year_id,term_id,code,name,year_of_study,is_active,created_at').order('name')],
    ['subjects', supabase.from('academic_subjects').select('id,code,name,department,is_active,created_at').order('name')],
    ['periods', supabase.from('academic_periods').select('id,term_id,period_number,display_name,starts_at,ends_at,is_active,created_at').order('period_number')],
    ['completeness', supabase.from('timetable_completeness').select('id,term_id,scope_type,section_id,status,updated_by,updated_at,published_at')],
  ];
  if (includeFacultyProfiles) {
    queries.push(['facultyProfiles', supabase.from('faculty_profiles').select('id,display_name,staff_identifier,department,created_at,updated_at').order('display_name')]);
  }

  const results = await Promise.all(queries.map(([, query]) => query));
  const data = emptyAcademicData();
  const failed = [];
  results.forEach((result, index) => {
    const [key] = queries[index];
    if (result.error) failed.push({ key, error: result.error });
    else data[key] = result.data || [];
  });

  return {
    available: true,
    schemaMissing: false,
    error: failed.length ? academicSchemaMessage(failed[0].error) : '',
    data,
  };
}

export function emptyAcademicData() {
  return { years: [], terms: [], sections: [], subjects: [], facultyProfiles: [], periods: [], completeness: [] };
}

export async function loadRoomsWithCategory() {
  const extended = await supabase.from('rooms')
    .select('id,code,name,building,floor,capacity,equipment,is_active,operational_status,category')
    .order('code');
  if (!extended.error || !isAcademicSchemaMissing(extended.error)) return extended;
  return supabase.from('rooms')
    .select('id,code,name,building,floor,capacity,equipment,is_active,operational_status')
    .order('code');
}

export async function loadTimetableEntries() {
  const extended = await supabase.from('timetable_entries')
    .select('id,room_id,faculty_id,subject,day_of_week,period,starts_at,ends_at,term_id,section_id,subject_id,academic_period_id,is_active')
    .order('day_of_week').order('period');
  if (!extended.error || !isAcademicSchemaMissing(extended.error)) return extended;
  return supabase.from('timetable_entries')
    .select('id,room_id,faculty_id,subject,day_of_week,period,starts_at,ends_at')
    .order('day_of_week').order('period');
}
