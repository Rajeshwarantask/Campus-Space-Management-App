const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCalendarDate(value) {
  if (!datePattern.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateDateRange(name, startsOn, endsOn) {
  if (!name?.trim()) return 'Enter a name.';
  if (!isCalendarDate(startsOn) || !isCalendarDate(endsOn)) return 'Choose valid start and end dates.';
  if (endsOn < startsOn) return 'The end date must be on or after the start date.';
  return '';
}

export function validateSection({ code, name, yearOfStudy }) {
  if (!code?.trim() || !name?.trim()) return 'Enter both a section code and display name.';
  if (yearOfStudy !== '' && (!Number.isInteger(Number(yearOfStudy)) || Number(yearOfStudy) < 1 || Number(yearOfStudy) > 10)) {
    return 'Year of study must be a whole number from 1 to 10.';
  }
  return '';
}

export function validateSubject({ name, code }) {
  if (!name?.trim()) return 'Enter a subject name.';
  return '';
}

export function validatePeriod({ periodNumber, startsAt, endsAt, displayName }) {
  if (!displayName?.trim()) return 'Enter a period display name.';
  const number = Number(periodNumber);
  if (!Number.isInteger(number) || number < 1 || number > 12) return 'Period number must be from 1 to 12.';
  if (!/^\d{2}:\d{2}$/.test(startsAt || '') || !/^\d{2}:\d{2}$/.test(endsAt || '')) return 'Choose valid start and end times.';
  if (endsAt <= startsAt) return 'The period end time must be after its start time.';
  return '';
}

export function validateTimetableEntry({ termId, sectionId, dayOfWeek, periodId, subjectId, facultyId, roomId, period }) {
  if (![termId, sectionId, periodId, subjectId, facultyId, roomId].every(Boolean)) return 'Choose a term, section, period, subject, faculty profile, and room.';
  if (![termId, sectionId, periodId, subjectId, facultyId, roomId].every((id) => uuidPattern.test(id))) return 'One of the selected records is invalid. Refresh the page and select it again.';
  const day = Number(dayOfWeek);
  if (!Number.isInteger(day) || day < 1 || day > 7) return 'Choose a valid day of the week.';
  if (!period || !Number.isInteger(Number(period.period_number))) return 'Choose an active canonical period.';
  return '';
}

export function explainAcademicError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('academic_years_no_date_overlap')) return 'These dates overlap an existing academic year.';
  if (message.includes('academic_terms_no_date_overlap')) return 'These dates overlap another term in this academic year.';
  if (message.includes('academic_term_outside_academic_year')) return 'The term dates must fall inside its academic year.';
  if (message.includes('academic_year_change_excludes_existing_term')) return 'The academic year cannot be shortened past one of its existing terms.';
  if (message.includes('academic_years_single_active_idx')) return 'Another academic year is already active. Complete or deactivate it before activating this one.';
  if (message.includes('academic_years_normalized_name_uidx')) return 'An academic year with this normalized name already exists.';
  if (message.includes('academic_terms_single_active_idx')) return 'Another term is already active. Complete or deactivate it before activating this one.';
  if (message.includes('academic_terms_normalized_name_uidx')) return 'A term with this name already exists in the selected academic year.';
  if (message.includes('academic_sections_normalized_code_uidx') || message.includes('academic_sections_term_code_unique')) return 'A section with this code already exists in the selected term.';
  if (message.includes('academic_periods_term_number_unique')) return 'That period number is already configured for this term.';
  if (message.includes('academic_subjects_normalized_name_uidx')) return 'A subject with this normalized name already exists.';
  if (message.includes('duplicate key')) return 'A record with the same code or identifier already exists.';
  if (message.includes('timetable_room_no_overlap')) return 'That room is already assigned to another class at this time.';
  if (message.includes('timetable_faculty_no_overlap')) return 'That faculty member is already teaching another class at this time.';
  if (message.includes('timetable_section_no_overlap')) return 'That section already has a class at this time.';
  if (message.includes('timetable_period_definition_mismatch')) return 'The schedule must use the selected period’s canonical start and end times.';
  if (message.includes('timetable_period_not_available')) return 'That period is inactive or does not belong to the selected term.';
  if (message.includes('timetable_academic_links_required')) return 'Choose all academic relationships before saving the class.';
  if (message.includes('academic_period_in_use')) return 'This period is already used by scheduled classes; create a replacement period instead of changing its times.';
  if (message.includes('faculty_profile_fkey')) return 'The selected faculty profile is not linked to an existing authentication user.';
  if (message.includes('room') && message.includes('foreign key')) return 'The selected room no longer exists. Refresh and choose another room.';
  return 'The database rejected this change. Review the selected records and try again.';
}
