import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import TimetableImport from './TimetableImport';
import { explainAcademicError, validateDateRange, validatePeriod, validateSection, validateSubject, validateTimetableEntry } from '../domain/academic';
import './AcademicManagement.css';

const tabs = [
  ['years', 'Years & terms'],
  ['sections', 'Sections'],
  ['subjects', 'Subjects'],
  ['faculty', 'Faculty'],
  ['periods', 'Periods'],
  ['timetable', 'Timetable'],
  ['import', 'Import timetable'],
  ['completeness', 'Completeness'],
];
const weekdays = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [7, 'Sunday']];
const emptyYear = { name: '', starts_on: '', ends_on: '', status: 'planned' };
const emptyTerm = { academic_year_id: '', name: '', starts_on: '', ends_on: '', status: 'planned' };
const emptySection = { academic_year_id: '', term_id: '', code: '', name: '', year_of_study: '', is_active: true };
const emptySubject = { code: '', name: '', department: '', is_active: true };
const emptyFaculty = { id: '', display_name: '', staff_identifier: '', department: '' };
const emptyPeriod = { period_number: '', display_name: '', starts_at: '', ends_at: '', is_active: true };

function isCompleteStatus(status) {
  return status === 'complete' || status === 'published';
}

function statusLabel(status) {
  return String(status || 'not_configured').replaceAll('_', ' ');
}

function shortTime(value) {
  return String(value || '').slice(0, 5);
}

function AcademicManagement({ available, schemaMissing = false, schemaError, academicData = {}, rooms = [], entries = [], onRefresh, onToast }) {
  const [tab, setTab] = useState('years');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedYearId, setSelectedYearId] = useState('');
  const [selectedTermId, setSelectedTermId] = useState('');
  const [yearEdit, setYearEdit] = useState('');
  const [termEdit, setTermEdit] = useState('');
  const [sectionEdit, setSectionEdit] = useState('');
  const [subjectEdit, setSubjectEdit] = useState('');
  const [facultyEdit, setFacultyEdit] = useState('');
  const [periodEdit, setPeriodEdit] = useState('');
  const [entryEdit, setEntryEdit] = useState('');
  const [yearForm, setYearForm] = useState(emptyYear);
  const [termForm, setTermForm] = useState(emptyTerm);
  const [sectionForm, setSectionForm] = useState(emptySection);
  const [subjectForm, setSubjectForm] = useState(emptySubject);
  const [facultyForm, setFacultyForm] = useState(emptyFaculty);
  const [periodForm, setPeriodForm] = useState(emptyPeriod);
  const [entryForm, setEntryForm] = useState({ term_id: '', section_id: '', day_of_week: '1', academic_period_id: '', subject_id: '', faculty_id: '', room_id: '' });
  const [completenessForm, setCompletenessForm] = useState({ term_id: '', scope_type: 'institution', section_id: '', status: 'in_progress' });

  const years = academicData.years || [];
  const terms = academicData.terms || [];
  const sections = academicData.sections || [];
  const subjects = academicData.subjects || [];
  const facultyProfiles = academicData.facultyProfiles || [];
  const periods = academicData.periods || [];
  const completeness = academicData.completeness || [];
  const yearId = selectedYearId || years.find((year) => year.status === 'active')?.id || years[0]?.id || '';
  const termId = selectedTermId || terms.find((term) => term.status === 'active')?.id || terms.find((term) => term.academic_year_id === yearId)?.id || '';
  const currentTerm = terms.find((term) => term.id === termId) || null;
  const termSections = sections.filter((section) => section.term_id === termId);
  const termPeriods = periods.filter((period) => period.term_id === termId).sort((left, right) => left.period_number - right.period_number);
  const activePeriods = termPeriods.filter((period) => period.is_active);
  const activeSubjects = subjects.filter((subject) => subject.is_active);
  const activeFaculty = facultyProfiles;
  const activeRooms = rooms.filter((room) => room.is_active !== false && room.operational_status !== 'retired' && room.category);
  const selectedEntryPeriod = termPeriods.find((period) => period.id === entryForm.academic_period_id);
  const termEntries = entries.filter((entry) => entry.term_id === termId);
  const selectedCompleteness = completeness.find((item) => item.term_id === (completenessForm.term_id || termId) && item.scope_type === completenessForm.scope_type && (completenessForm.scope_type === 'institution' || item.section_id === (completenessForm.section_id || termSections[0]?.id)));

  const timetableGrid = activePeriods.map((period) => ({
    period,
    days: weekdays.map(([day, label]) => ({
      day,
      label,
      entry: termEntries.find((entry) => entry.is_active !== false && Number(entry.day_of_week) === day && entry.academic_period_id === period.id) || null,
    })),
  }));

  async function saveRecord(table, editId, values, successMessage, reset, successCallback = onRefresh) {
    setSaving(true);
    setError('');
    try {
      const query = editId
        ? supabase.from(table).update(values).eq('id', editId)
        : supabase.from(table).insert(values);
      const { error: saveError } = await query;
      if (saveError) {
        setError(explainAcademicError(saveError));
        setSaving(false);
        return;
      }
      reset();
      setSaving(false);
      onToast(successMessage);
      await successCallback?.();
    } catch {
      setError('The request could not reach the database. Nothing was reported as saved.');
      setSaving(false);
    }
  }

  async function updateActive(table, id, isActive, label) {
    setSaving(true);
    setError('');
    const { error: updateError } = await supabase.from(table).update({ is_active: !isActive }).eq('id', id);
    setSaving(false);
    if (updateError) return setError(explainAcademicError(updateError));
    onToast(`${label} ${isActive ? 'deactivated' : 'reactivated'}.`);
    onRefresh();
  }

  function resetYear() { setYearEdit(''); setYearForm(emptyYear); }
  function resetTerm() { setTermEdit(''); setTermForm({ ...emptyTerm, academic_year_id: yearId }); }
  function resetSection() { setSectionEdit(''); setSectionForm({ ...emptySection, academic_year_id: yearId, term_id: termId }); }
  function resetSubject() { setSubjectEdit(''); setSubjectForm(emptySubject); }
  function resetFaculty() { setFacultyEdit(''); setFacultyForm(emptyFaculty); }
  function resetPeriod() { setPeriodEdit(''); setPeriodForm(emptyPeriod); }
  function resetEntry() { setEntryEdit(''); setEntryForm({ term_id: termId, section_id: '', day_of_week: '1', academic_period_id: '', subject_id: '', faculty_id: '', room_id: '' }); }

  function editYear(year) {
    setYearEdit(year.id);
    setYearForm({ name: year.name, starts_on: year.starts_on, ends_on: year.ends_on, status: year.status });
  }
  function editTerm(term) {
    setTermEdit(term.id);
    setTermForm({ academic_year_id: term.academic_year_id, name: term.name, starts_on: term.starts_on, ends_on: term.ends_on, status: term.status });
  }
  function editSection(section) {
    setSectionEdit(section.id);
    setSectionForm({ academic_year_id: section.academic_year_id, term_id: section.term_id, code: section.code, name: section.name, year_of_study: section.year_of_study ?? '', is_active: section.is_active });
  }
  function editSubject(subject) {
    setSubjectEdit(subject.id);
    setSubjectForm({ code: subject.code || '', name: subject.name, department: subject.department || '', is_active: subject.is_active });
  }
  function editFaculty(profile) {
    setFacultyEdit(profile.id);
    setFacultyForm({ id: profile.id, display_name: profile.display_name, staff_identifier: profile.staff_identifier || '', department: profile.department || '' });
  }
  function editPeriod(period) {
    setPeriodEdit(period.id);
    setPeriodForm({ period_number: String(period.period_number), display_name: period.display_name, starts_at: shortTime(period.starts_at), ends_at: shortTime(period.ends_at), is_active: period.is_active });
  }
  function editEntry(entry) {
    if (!entry.term_id || !entry.academic_period_id || !entry.section_id || !entry.subject_id) {
      setError('This legacy timetable row has no academic links and cannot be edited here. Preserve it and migrate its relationships before changing it.');
      return;
    }
    setEntryEdit(entry.id);
    setEntryForm({ term_id: entry.term_id, section_id: entry.section_id, day_of_week: String(entry.day_of_week), academic_period_id: entry.academic_period_id, subject_id: entry.subject_id, faculty_id: entry.faculty_id, room_id: entry.room_id });
  }

  async function removeEntry(entry) {
    if (!window.confirm('Delete this scheduled class? This does not delete its room, section, subject, or faculty profile.')) return;
    setSaving(true);
    setError('');
    const { error: deleteError } = await supabase.from('timetable_entries').delete().eq('id', entry.id);
    setSaving(false);
    if (deleteError) return setError(explainAcademicError(deleteError));
    onToast('Scheduled class removed.');
    await onRefresh();
  }

  async function saveCompleteness(event) {
    event.preventDefault();
    const targetTermId = completenessForm.term_id || termId;
    const sectionId = completenessForm.scope_type === 'section' ? completenessForm.section_id || termSections[0]?.id : null;
    if (!targetTermId) return setError('Create or select an academic term first.');
    if (completenessForm.scope_type === 'section' && !sectionId) return setError('Select a section for section-level completeness.');
    setSaving(true);
    setError('');
    const current = completeness.find((item) => item.term_id === targetTermId && item.scope_type === completenessForm.scope_type && item.section_id === sectionId);
    const values = { term_id: targetTermId, scope_type: completenessForm.scope_type, section_id: sectionId, status: completenessForm.status, updated_by: (await supabase.auth.getUser()).data.user?.id || null, updated_at: new Date().toISOString(), published_at: completenessForm.status === 'published' ? new Date().toISOString() : null };
    const result = current
      ? await supabase.from('timetable_completeness').update(values).eq('id', current.id)
      : await supabase.from('timetable_completeness').insert(values);
    setSaving(false);
    if (result.error) return setError(explainAcademicError(result.error));
    onToast('Timetable completeness status saved.');
    await onRefresh();
  }

  async function saveTimetableEntry(event) {
    event.preventDefault();
    const period = periods.find((item) => item.id === entryForm.academic_period_id);
    const submission = { ...entryForm, term_id: entryForm.term_id || termId };
    const validationError = validateTimetableEntry({ ...submission, period });
    if (validationError) return setError(validationError);
    const values = {
      term_id: submission.term_id,
      section_id: entryForm.section_id,
      day_of_week: Number(entryForm.day_of_week),
      period: period.period_number,
      subject_id: entryForm.subject_id,
      subject: subjects.find((subject) => subject.id === entryForm.subject_id)?.name || '',
      faculty_id: entryForm.faculty_id,
      room_id: entryForm.room_id,
      academic_period_id: period.id,
      starts_at: period.starts_at,
      ends_at: period.ends_at,
      is_active: true,
    };
    await saveRecord('timetable_entries', entryEdit, values, entryEdit ? 'Scheduled class updated.' : 'Scheduled class added.', resetEntry);
  }

  if (!available) {
    return <section className="page-content academic-management">
      <div className="page-intro"><div><p className="eyebrow">CAMPUS OPERATIONS / ACADEMICS</p><h2>Academic management.</h2><p>Configure the academic calendar and enter scheduled classes without creating a second timetable.</p></div><span className="pill">ADMIN ONLY</span></div>
      <div className="academic-schema-state" role="status"><span className="academic-state-icon">!</span><div><strong>{schemaMissing ? 'Academic database migration required' : 'Academic data is unavailable'}</strong><p>{schemaError || 'The academic schema could not be read. No academic records have been created or changed.'}</p><small>{schemaMissing ? 'Deploy the academic database migration before using these administration forms.' : 'Check database permissions and retry before using these administration forms.'}</small></div></div>
    </section>;
  }

  return <section className="page-content academic-management">
    <div className="page-intro"><div><p className="eyebrow">CAMPUS OPERATIONS / ACADEMICS</p><h2>Academic management.</h2><p>One source of truth for terms, sections, subjects, faculty, periods, scheduled classes, and completeness.</p></div><span className="pill mint">ADMIN ONLY</span></div>
    {schemaError && <div className="academic-inline-error" role="alert">{schemaError} Some lists may be incomplete; retry before making changes.</div>}
    <div className="academic-summary">
      <div><span>Academic years</span><strong>{years.length}</strong></div>
      <div><span>Terms</span><strong>{terms.length}</strong></div>
      <div><span>Sections</span><strong>{sections.filter((item) => item.is_active).length}</strong></div>
      <div><span>Scheduled classes</span><strong>{entries.filter((entry) => entry.is_active !== false).length}</strong></div>
    </div>
    <nav className="academic-tabs" aria-label="Academic management sections">
      {tabs.map(([key, label]) => <button type="button" key={key} className={tab === key ? 'active' : ''} aria-current={tab === key ? 'page' : undefined} onClick={() => { setTab(key); setError(''); }}>{label}</button>)}
    </nav>
    {error && <div className="academic-inline-error" role="alert">{error}</div>}

    {tab === 'years' && <div className="academic-layout">
      <form className="academic-card" onSubmit={(event) => { event.preventDefault(); const validation = validateDateRange(yearForm.name, yearForm.starts_on, yearForm.ends_on); if (validation) return setError(validation); saveRecord('academic_years', yearEdit, { ...yearForm, name: yearForm.name.trim() }, yearEdit ? 'Academic year updated.' : 'Academic year created.', resetYear); }}>
        <CardHeading eyebrow="ACADEMIC CALENDAR" title={yearEdit ? 'Edit academic year' : 'Create academic year'} />
        <label>Year name<input required maxLength="80" value={yearForm.name} onChange={(event) => setYearForm({ ...yearForm, name: event.target.value })} placeholder="2026–2027" /></label>
        <div className="academic-form-grid"><label>Starts<input type="date" required value={yearForm.starts_on} onChange={(event) => setYearForm({ ...yearForm, starts_on: event.target.value })} /></label><label>Ends<input type="date" required value={yearForm.ends_on} onChange={(event) => setYearForm({ ...yearForm, ends_on: event.target.value })} /></label></div>
        <label>Status<select value={yearForm.status} onChange={(event) => setYearForm({ ...yearForm, status: event.target.value })}><StatusOptions /></select></label>
        <FormActions busy={saving} editing={Boolean(yearEdit)} onCancel={resetYear} label="academic year" />
      </form>
      <div className="academic-card"><CardHeading eyebrow="YEAR RECORDS" title="Academic years" />{years.length ? <div className="academic-record-list">{years.map((year) => <article className="academic-record" key={year.id}><div><strong>{year.name}</strong><p>{year.starts_on} → {year.ends_on}</p><StatusBadge status={year.status} /></div><button type="button" className="text-button" onClick={() => editYear(year)}>Edit</button></article>)}</div> : <EmptyRecords text="No academic years configured yet." />}</div>
      <form className="academic-card" onSubmit={(event) => { event.preventDefault(); const validation = validateDateRange(termForm.name, termForm.starts_on, termForm.ends_on); if (validation) return setError(validation); if (!termForm.academic_year_id) return setError('Choose the academic year that contains this term.'); saveRecord('academic_terms', termEdit, { ...termForm, name: termForm.name.trim() }, termEdit ? 'Term updated.' : 'Term created.', resetTerm); }}>
        <CardHeading eyebrow="TERM / SEMESTER" title={termEdit ? 'Edit term' : 'Create term'} />
        <label>Academic year<select required value={termForm.academic_year_id} onChange={(event) => setTermForm({ ...termForm, academic_year_id: event.target.value })}><option value="">Choose a year</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
        <label>Term name<input required maxLength="80" value={termForm.name} onChange={(event) => setTermForm({ ...termForm, name: event.target.value })} placeholder="Semester 1" /></label>
        <div className="academic-form-grid"><label>Starts<input type="date" required value={termForm.starts_on} onChange={(event) => setTermForm({ ...termForm, starts_on: event.target.value })} /></label><label>Ends<input type="date" required value={termForm.ends_on} onChange={(event) => setTermForm({ ...termForm, ends_on: event.target.value })} /></label></div>
        <label>Status<select value={termForm.status} onChange={(event) => setTermForm({ ...termForm, status: event.target.value })}><StatusOptions /></select></label>
        <FormActions busy={saving} editing={Boolean(termEdit)} onCancel={resetTerm} label="term" />
      </form>
      <div className="academic-card"><CardHeading eyebrow="TERM RECORDS" title="Terms & semesters" />{terms.length ? <div className="academic-record-list">{terms.map((term) => <article className="academic-record" key={term.id}><div><strong>{term.name}</strong><p>{years.find((year) => year.id === term.academic_year_id)?.name || 'Year unavailable'} · {term.starts_on} → {term.ends_on}</p><StatusBadge status={term.status} /></div><button type="button" className="text-button" onClick={() => editTerm(term)}>Edit</button></article>)}</div> : <EmptyRecords text="No terms configured yet." />}</div>
    </div>}

    {tab === 'sections' && <div className="academic-layout">
      <form className="academic-card" onSubmit={(event) => { event.preventDefault(); const validation = validateSection(sectionForm); if (validation) return setError(validation); const effectiveYearId = sectionForm.academic_year_id || yearId; const effectiveTermId = sectionForm.term_id || termId; if (!effectiveTermId || !effectiveYearId) return setError('Choose an academic year and its term.'); saveRecord('academic_sections', sectionEdit, { ...sectionForm, academic_year_id: effectiveYearId, term_id: effectiveTermId, code: sectionForm.code.trim(), name: sectionForm.name.trim(), year_of_study: sectionForm.year_of_study === '' ? null : Number(sectionForm.year_of_study) }, sectionEdit ? 'Section updated.' : 'Section created.', resetSection); }}>
        <CardHeading eyebrow="STUDENT COHORTS" title={sectionEdit ? 'Edit section' : 'Create section'} />
        <label>Academic year<select required value={sectionForm.academic_year_id || yearId} onChange={(event) => { const nextYearId = event.target.value; const nextTerm = terms.find((term) => term.academic_year_id === nextYearId); setSelectedYearId(nextYearId); setSelectedTermId(nextTerm?.id || ''); setSectionForm({ ...sectionForm, academic_year_id: nextYearId, term_id: nextTerm?.id || '' }); }}><option value="">Choose a year</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
        <label>Term<select required value={sectionForm.term_id || termId} onChange={(event) => setSectionForm({ ...sectionForm, term_id: event.target.value })}><option value="">Choose a term</option>{terms.filter((term) => term.academic_year_id === (sectionForm.academic_year_id || yearId)).map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label>
        <div className="academic-form-grid"><label>Section code<input required maxLength="40" value={sectionForm.code} onChange={(event) => setSectionForm({ ...sectionForm, code: event.target.value })} placeholder="3-C" /></label><label>Display name<input required maxLength="100" value={sectionForm.name} onChange={(event) => setSectionForm({ ...sectionForm, name: event.target.value })} placeholder="Third Year · Section C" /></label></div>
        <label>Year of study<input type="number" min="1" max="10" value={sectionForm.year_of_study} onChange={(event) => setSectionForm({ ...sectionForm, year_of_study: event.target.value })} placeholder="3" /></label>
        {sectionEdit && <label className="academic-checkbox"><input type="checkbox" checked={sectionForm.is_active} onChange={(event) => setSectionForm({ ...sectionForm, is_active: event.target.checked })} /> Active section</label>}
        <FormActions busy={saving} editing={Boolean(sectionEdit)} onCancel={resetSection} label="section" />
      </form>
      <div className="academic-card"><div className="academic-heading-row"><CardHeading eyebrow="TERM SECTIONS" title={currentTerm?.name || 'Select a term'} /><select aria-label="Filter sections by term" value={termId} onChange={(event) => setSelectedTermId(event.target.value)}><option value="">Choose term</option>{terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></div>{termSections.length ? <div className="academic-record-list">{termSections.map((section) => <article className="academic-record" key={section.id}><div><strong>{section.name}</strong><p>{section.code} · Year {section.year_of_study || '—'} · {section.is_active ? 'Active' : 'Inactive'}</p></div><div className="academic-record-actions"><button type="button" className="text-button" onClick={() => editSection(section)}>Edit</button><button type="button" className="text-button" disabled={saving} onClick={() => updateActive('academic_sections', section.id, section.is_active, 'Section')}>{section.is_active ? 'Deactivate' : 'Reactivate'}</button></div></article>)}</div> : <EmptyRecords text="No sections are configured for this term." />}</div>
    </div>}

    {tab === 'subjects' && <div className="academic-layout">
      <form className="academic-card" onSubmit={(event) => { event.preventDefault(); const validation = validateSubject(subjectForm); if (validation) return setError(validation); saveRecord('academic_subjects', subjectEdit, { ...subjectForm, code: subjectForm.code.trim() || null, name: subjectForm.name.trim(), department: subjectForm.department.trim() || null }, subjectEdit ? 'Subject updated.' : 'Subject created.', resetSubject); }}>
        <CardHeading eyebrow="SUBJECT CATALOG" title={subjectEdit ? 'Edit subject' : 'Create subject'} />
        <label>Subject name<input required maxLength="120" value={subjectForm.name} onChange={(event) => setSubjectForm({ ...subjectForm, name: event.target.value })} placeholder="Operating Systems" /></label>
        <div className="academic-form-grid"><label>Subject code<input maxLength="32" value={subjectForm.code} onChange={(event) => setSubjectForm({ ...subjectForm, code: event.target.value })} placeholder="CS301" /></label><label>Department<input maxLength="100" value={subjectForm.department} onChange={(event) => setSubjectForm({ ...subjectForm, department: event.target.value })} placeholder="Computer Science" /></label></div>
        {subjectEdit && <label className="academic-checkbox"><input type="checkbox" checked={subjectForm.is_active} onChange={(event) => setSubjectForm({ ...subjectForm, is_active: event.target.checked })} /> Active subject</label>}
        <FormActions busy={saving} editing={Boolean(subjectEdit)} onCancel={resetSubject} label="subject" />
      </form>
      <div className="academic-card"><CardHeading eyebrow="CATALOG" title={`${subjects.length} subjects`} />{subjects.length ? <div className="academic-record-list">{subjects.map((subject) => <article className="academic-record" key={subject.id}><div><strong>{subject.name}</strong><p>{subject.code || 'No code'}{subject.department ? ` · ${subject.department}` : ''} · {subject.is_active ? 'Active' : 'Inactive'}</p></div><div className="academic-record-actions"><button type="button" className="text-button" onClick={() => editSubject(subject)}>Edit</button><button type="button" className="text-button" disabled={saving} onClick={() => updateActive('academic_subjects', subject.id, subject.is_active, 'Subject')}>{subject.is_active ? 'Deactivate' : 'Reactivate'}</button></div></article>)}</div> : <EmptyRecords text="No subjects are configured yet." />}</div>
    </div>}

    {tab === 'faculty' && <div className="academic-layout">
      <form className="academic-card" onSubmit={(event) => { event.preventDefault(); if (!facultyForm.id.trim() || !facultyForm.display_name.trim()) return setError('Enter an existing Auth user UUID and faculty name.'); const values = { id: facultyForm.id.trim(), display_name: facultyForm.display_name.trim(), staff_identifier: facultyForm.staff_identifier.trim() || null, department: facultyForm.department.trim() || null, updated_at: new Date().toISOString() }; if (facultyEdit && facultyEdit !== values.id) return setError('A linked Auth identity is stable and cannot be changed. Link a different existing user as a separate profile.'); saveRecord('faculty_profiles', facultyEdit, values, facultyEdit ? 'Faculty profile updated.' : 'Existing user linked as faculty.', resetFaculty); }}>
        <CardHeading eyebrow="EXISTING AUTH IDENTITIES" title={facultyEdit ? 'Edit faculty profile' : 'Link faculty profile'} />
        <p className="academic-helper">This client cannot enumerate private Auth users. Enter the UUID of an existing account; the database verifies the identity. This form never creates an authentication account.</p>
        <label>Existing Auth user UUID<input required readOnly={Boolean(facultyEdit)} value={facultyForm.id} onChange={(event) => setFacultyForm({ ...facultyForm, id: event.target.value })} placeholder="UUID from the authorized identity workflow" /></label>
        <label>Faculty name<input required maxLength="120" value={facultyForm.display_name} onChange={(event) => setFacultyForm({ ...facultyForm, display_name: event.target.value })} placeholder="Name shown in administration" /></label>
        <div className="academic-form-grid"><label>Staff identifier<input maxLength="64" value={facultyForm.staff_identifier} onChange={(event) => setFacultyForm({ ...facultyForm, staff_identifier: event.target.value })} /></label><label>Department<input maxLength="100" value={facultyForm.department} onChange={(event) => setFacultyForm({ ...facultyForm, department: event.target.value })} /></label></div>
        <FormActions busy={saving} editing={Boolean(facultyEdit)} onCancel={resetFaculty} label="faculty profile" />
      </form>
      <div className="academic-card"><CardHeading eyebrow="FACULTY PROFILES" title={`${facultyProfiles.length} linked profiles`} />{facultyProfiles.length ? <div className="academic-record-list">{facultyProfiles.map((profile) => <article className="academic-record" key={profile.id}><div><strong>{profile.display_name}</strong><p>{profile.department || 'Department not set'} · {profile.staff_identifier || profile.id}</p></div><button type="button" className="text-button" onClick={() => editFaculty(profile)}>Edit</button></article>)}</div> : <EmptyRecords text="No faculty profiles are linked yet." />}</div>
    </div>}

    {tab === 'periods' && <div className="academic-layout">
      <form className="academic-card" onSubmit={(event) => { event.preventDefault(); const validation = validatePeriod({ ...periodForm, startsAt: periodForm.starts_at, endsAt: periodForm.ends_at, displayName: periodForm.display_name }); if (validation) return setError(validation); if (!termId) return setError('Create or select a term first.'); saveRecord('academic_periods', periodEdit, { term_id: termId, period_number: Number(periodForm.period_number), display_name: periodForm.display_name.trim(), starts_at: periodForm.starts_at, ends_at: periodForm.ends_at, is_active: periodForm.is_active }, periodEdit ? 'Academic period updated.' : 'Academic period created.', resetPeriod); }}>
        <CardHeading eyebrow="TERM DAILY SCHEDULE" title={periodEdit ? 'Edit period' : 'Configure period'} />
        <label>Academic term<select value={termId} onChange={(event) => setSelectedTermId(event.target.value)} required><option value="">Choose a term</option>{terms.map((term) => <option key={term.id} value={term.id}>{years.find((year) => year.id === term.academic_year_id)?.name} · {term.name}</option>)}</select></label>
        <div className="academic-form-grid"><label>Period number<input type="number" min="1" max="12" required value={periodForm.period_number} onChange={(event) => setPeriodForm({ ...periodForm, period_number: event.target.value })} /></label><label>Display name<input required maxLength="60" value={periodForm.display_name} onChange={(event) => setPeriodForm({ ...periodForm, display_name: event.target.value })} placeholder="Period 1" /></label></div>
        <div className="academic-form-grid"><label>Starts<input type="time" required value={periodForm.starts_at} onChange={(event) => setPeriodForm({ ...periodForm, starts_at: event.target.value })} /></label><label>Ends<input type="time" required value={periodForm.ends_at} onChange={(event) => setPeriodForm({ ...periodForm, ends_at: event.target.value })} /></label></div>
        {periodEdit && <label className="academic-checkbox"><input type="checkbox" checked={periodForm.is_active} onChange={(event) => setPeriodForm({ ...periodForm, is_active: event.target.checked })} /> Active period</label>}
        <FormActions busy={saving} editing={Boolean(periodEdit)} onCancel={resetPeriod} label="period" />
      </form>
      <div className="academic-card"><div className="academic-heading-row"><CardHeading eyebrow="CANONICAL TIMES" title={currentTerm?.name || 'Daily periods'} /><select aria-label="View period definitions by term" value={termId} onChange={(event) => setSelectedTermId(event.target.value)}><option value="">Choose term</option>{terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></div>{termPeriods.length ? <div className="period-record-list">{termPeriods.map((period) => <article className="academic-record" key={period.id}><div><strong>{period.display_name}</strong><p>Period {period.period_number} · {shortTime(period.starts_at)}–{shortTime(period.ends_at)}</p><StatusBadge status={period.is_active ? 'active' : 'inactive'} /></div><div className="academic-record-actions"><button type="button" className="text-button" onClick={() => editPeriod(period)}>Edit</button><button type="button" className="text-button" disabled={saving} onClick={() => updateActive('academic_periods', period.id, period.is_active, 'Period')}>{period.is_active ? 'Deactivate' : 'Reactivate'}</button></div></article>)}</div> : <EmptyRecords text="No period definitions for this term." />}</div>
    </div>}

    {tab === 'import' && <TimetableImport academicData={academicData} rooms={rooms} entries={entries} onRefresh={onRefresh} onToast={onToast} />}

    {tab === 'timetable' && <div className="academic-timetable-layout">
      <div className="academic-card">
        <div className="academic-heading-row"><CardHeading eyebrow="SCHEDULED CLASSES" title={currentTerm?.name || 'Select an academic term'} /><label className="compact-select">Term<select value={termId} onChange={(event) => { setSelectedTermId(event.target.value); setEntryForm({ ...entryForm, term_id: event.target.value, section_id: '', academic_period_id: '' }); }}><option value="">Choose term</option>{terms.map((term) => <option key={term.id} value={term.id}>{years.find((year) => year.id === term.academic_year_id)?.name} · {term.name}</option>)}</select></label></div>
        {!currentTerm ? <EmptyRecords text="Create an academic term before adding classes." /> : !activePeriods.length ? <EmptyRecords text="Configure at least one active canonical period for this term." /> : !termSections.filter((section) => section.is_active).length ? <EmptyRecords text="Create an active student section for this term." /> : !activeFaculty.length ? <EmptyRecords text="Link existing Auth users to faculty profiles before scheduling classes." /> : !activeSubjects.length ? <EmptyRecords text="Create active subjects before scheduling classes." /> : !activeRooms.length ? <EmptyRecords text="Classify active rooms as classroom or laboratory before scheduling classes." /> : <form className="academic-entry-form" onSubmit={saveTimetableEntry}>
          <div className="academic-form-grid">
            <label>Section<select required value={entryForm.section_id} onChange={(event) => setEntryForm({ ...entryForm, section_id: event.target.value })}><option value="">Choose section</option>{termSections.filter((section) => section.is_active).map((section) => <option key={section.id} value={section.id}>{section.code} · {section.name}</option>)}</select></label>
            <label>Day<select required value={entryForm.day_of_week} onChange={(event) => setEntryForm({ ...entryForm, day_of_week: event.target.value })}>{weekdays.map(([day, label]) => <option key={day} value={day}>{label}</option>)}</select></label>
            <label>Period<select required value={entryForm.academic_period_id} onChange={(event) => setEntryForm({ ...entryForm, academic_period_id: event.target.value })}><option value="">Choose period</option>{activePeriods.map((period) => <option key={period.id} value={period.id}>{period.display_name} · {shortTime(period.starts_at)}–{shortTime(period.ends_at)}</option>)}</select></label>
            <label>Subject<select required value={entryForm.subject_id} onChange={(event) => setEntryForm({ ...entryForm, subject_id: event.target.value })}><option value="">Choose subject</option>{activeSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code ? `${subject.code} · ` : ''}{subject.name}</option>)}</select></label>
            <label>Faculty<select required value={entryForm.faculty_id} onChange={(event) => setEntryForm({ ...entryForm, faculty_id: event.target.value })}><option value="">Choose faculty</option>{activeFaculty.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}{profile.department ? ` · ${profile.department}` : ''}</option>)}</select></label>
            <label>Room<select required value={entryForm.room_id} onChange={(event) => setEntryForm({ ...entryForm, room_id: event.target.value })}><option value="">Choose room</option>{activeRooms.map((room) => <option key={room.id} value={room.id}>{room.code} · {room.name} ({room.category})</option>)}</select></label>
          </div>
          {selectedEntryPeriod && <div className="academic-period-summary"><span>Canonical schedule</span><strong>{selectedEntryPeriod.display_name} · {shortTime(selectedEntryPeriod.starts_at)}–{shortTime(selectedEntryPeriod.ends_at)}</strong><small>Saved class times are taken from this database period definition.</small></div>}
          <FormActions busy={saving} editing={Boolean(entryEdit)} onCancel={resetEntry} label="scheduled class" submitText={entryEdit ? 'Save class changes' : 'Add scheduled class'} />
        </form>}
      </div>
      {currentTerm && <div className="academic-card"><div className="academic-heading-row"><CardHeading eyebrow="WEEKLY GRID" title="Section timetable" /><select aria-label="View timetable by section" value={entryForm.section_id} onChange={(event) => setEntryForm({ ...entryForm, section_id: event.target.value })}><option value="">All sections</option>{termSections.map((section) => <option key={section.id} value={section.id}>{section.code} · {section.name}</option>)}</select></div>
        {timetableGrid.length ? <div className="academic-grid-wrap"><div className="academic-grid"><div className="academic-grid-head">Period</div>{weekdays.map(([, label]) => <div className="academic-grid-head" key={label}>{label.slice(0, 3)}</div>)}{timetableGrid.map(({ period, days }) => <React.Fragment key={period.id}><div className="academic-grid-period"><strong>{period.display_name}</strong><small>{shortTime(period.starts_at)}–{shortTime(period.ends_at)}</small></div>{days.map(({ day, entry }) => {
          const selectedSection = entryForm.section_id;
          const cellEntry = entry && (!selectedSection || entry.section_id === selectedSection) ? entry : null;
          const section = cellEntry && sections.find((item) => item.id === cellEntry.section_id);
          const subject = cellEntry && subjects.find((item) => item.id === cellEntry.subject_id);
          const faculty = cellEntry && facultyProfiles.find((item) => item.id === cellEntry.faculty_id);
          const room = cellEntry && rooms.find((item) => item.id === cellEntry.room_id);
          return <div className={cellEntry ? 'academic-grid-cell occupied' : 'academic-grid-cell'} key={`${period.id}-${day}`}>
            {cellEntry ? <><strong>{subject?.name || cellEntry.subject}</strong><small>{section?.code || 'Section'} · {faculty?.display_name || 'Faculty'} · {room?.code || 'Room'}</small><div className="academic-record-actions"><button type="button" className="text-button" onClick={() => editEntry(cellEntry)}>Edit</button><button type="button" className="text-button" disabled={saving} onClick={() => removeEntry(cellEntry)}>Remove</button></div></> : <span>—</span>}
          </div>;
        })}</React.Fragment>)}</div></div> : <EmptyRecords text="Define academic periods to build the timetable grid." />}
        <p className="academic-helper">The PostgreSQL exclusion constraints are authoritative. A conflict leaves the previous schedule intact and is shown as a validation error above.</p>
      </div>}
    </div>}

    {tab === 'completeness' && <div className="academic-layout">
      <form className="academic-card" onSubmit={saveCompleteness}>
        <CardHeading eyebrow="SCHEDULE COVERAGE" title="Set completeness explicitly" />
        <p className="academic-helper">These states are administrator declarations; Northstar does not infer completeness from the number of class records.</p>
        <label>Academic term<select required value={completenessForm.term_id || termId} onChange={(event) => { setSelectedTermId(event.target.value); setCompletenessForm({ ...completenessForm, term_id: event.target.value }); }}><option value="">Choose term</option>{terms.map((term) => <option key={term.id} value={term.id}>{years.find((year) => year.id === term.academic_year_id)?.name} · {term.name}</option>)}</select></label>
        <label>Scope<select value={completenessForm.scope_type} onChange={(event) => setCompletenessForm({ ...completenessForm, scope_type: event.target.value, section_id: '' })}><option value="institution">Institution-wide timetable</option><option value="section">One student section</option></select></label>
        {completenessForm.scope_type === 'section' && <label>Section<select required value={completenessForm.section_id || termSections[0]?.id || ''} onChange={(event) => setCompletenessForm({ ...completenessForm, section_id: event.target.value })}><option value="">Choose section</option>{termSections.map((section) => <option key={section.id} value={section.id}>{section.code} · {section.name}</option>)}</select></label>}
        <div className="academic-current-status"><span>Current scope status</span><StatusBadge status={selectedCompleteness?.status || 'not_configured'} /></div>
        <label>New status<select value={completenessForm.status} onChange={(event) => setCompletenessForm({ ...completenessForm, status: event.target.value })}><option value="not_configured">Not configured</option><option value="in_progress">In progress</option><option value="complete">Complete</option><option value="published">Published</option></select></label>
        <button className="primary-button full" disabled={saving || !terms.length}>{saving ? 'Saving…' : 'Save completeness status'}</button>
      </form>
      <div className="academic-card"><CardHeading eyebrow="TERM STATUS" title="Configured scopes" />{completeness.length ? <div className="academic-record-list">{completeness.map((item) => <article className="academic-record" key={item.id}><div><strong>{terms.find((term) => term.id === item.term_id)?.name || 'Term unavailable'} · {item.scope_type === 'institution' ? 'Institution' : sections.find((section) => section.id === item.section_id)?.name || 'Section'}</strong><p>Updated {new Date(item.updated_at).toLocaleString()}</p><StatusBadge status={item.status} /></div><button type="button" className="text-button" onClick={() => { setSelectedTermId(item.term_id); setCompletenessForm({ term_id: item.term_id, scope_type: item.scope_type, section_id: item.section_id || '', status: item.status }); }}>Edit status</button></article>)}</div> : <EmptyRecords text="No completeness status has been declared. The timetable is treated as not configured." />}</div>
    </div>}
  </section>;
}

function RoomClassificationPanel({ rooms, available, schemaError, onRefresh }) {
  const [savingRoom, setSavingRoom] = useState('');
  const [error, setError] = useState('');
  async function setCategory(room, category) {
    setSavingRoom(room.id);
    setError('');
    const { error: updateError } = await supabase.from('rooms').update({ category: category || null }).eq('id', room.id);
    setSavingRoom('');
    if (updateError) return setError(explainAcademicError(updateError));
    await onRefresh();
  }
  return <section className="academic-card room-classification-panel">
    <CardHeading eyebrow="ACADEMIC SPACE TYPES" title="Room classification" />
    {!available ? <div className="academic-schema-state compact" role="status"><div><strong>Room classification is unavailable.</strong><p>{schemaError || 'Existing rooms are unchanged. Room names are never used to guess classroom or laboratory type.'}</p></div></div> : <>
      <p className="academic-helper">Choose a category from verified room information. Unclassified rooms remain visible here and are excluded from classroom/laboratory availability filters.</p>
      {error && <div className="academic-inline-error" role="alert">{error}</div>}
      <div className="academic-record-list">{rooms.map((room) => <article className="academic-record" key={room.id}><div><strong>{room.code} · {room.name}</strong><p>{room.building} · {room.capacity} seats · {room.operational_status || (room.is_active === false ? 'Inactive' : 'Operational')}</p>{!room.category && <StatusBadge status="unclassified" />}</div><label className="room-category-select"><span className="sr-only">Classify {room.code}</span><select value={room.category || ''} disabled={savingRoom === room.id} onChange={(event) => setCategory(room, event.target.value)}><option value="">Unclassified</option><option value="classroom">Classroom</option><option value="laboratory">Laboratory</option></select></label></article>)}</div>
    </>}
  </section>;
}

function CardHeading({ eyebrow, title }) {
  return <div className="academic-card-heading"><p className="eyebrow">{eyebrow}</p><h3>{title}</h3></div>;
}

function FormActions({ busy, editing, onCancel, label, submitText }) {
  return <div className="academic-form-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : submitText || (editing ? `Save ${label}` : `Create ${label}`)}</button>{editing && <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel edit</button>}</div>;
}

function StatusOptions() {
  return <><option value="planned">Planned</option><option value="active">Active</option><option value="completed">Completed</option></>;
}

function StatusBadge({ status }) {
  return <span className={`academic-status status-${String(status || 'not_configured').replaceAll('_', '-')}`}>{statusLabel(status)}</span>;
}

function EmptyRecords({ text }) {
  return <div className="academic-empty"><strong>{text}</strong></div>;
}

function AcademicTimetableView({ rooms, bookings, entries = [], academicData = {}, academicSchema = {} }) {
  const [termSelection, setTermSelection] = useState('');
  const [sectionSelection, setSectionSelection] = useState('');
  const years = academicData.years || [];
  const terms = academicData.terms || [];
  const sections = academicData.sections || [];
  const subjects = academicData.subjects || [];
  const profiles = academicData.facultyProfiles || [];
  const periods = academicData.periods || [];
  const completeness = academicData.completeness || [];
  const termId = termSelection || terms.find((term) => term.status === 'active')?.id || terms[0]?.id || '';
  const term = terms.find((item) => item.id === termId);
  const termSections = sections.filter((section) => section.term_id === termId && section.is_active);
  const sectionId = termSections.some((section) => section.id === sectionSelection) ? sectionSelection : '';
  const termPeriods = periods.filter((period) => period.term_id === termId && period.is_active).slice().sort((a, b) => a.period_number - b.period_number);
  const termEntries = entries.filter((entry) => entry.term_id === termId && entry.is_active !== false);
  const scopeStatus = sectionId
    ? completeness.find((item) => item.term_id === termId && item.scope_type === 'section' && item.section_id === sectionId)?.status
    : completeness.find((item) => item.term_id === termId && item.scope_type === 'institution')?.status;
  const isComplete = isCompleteStatus(scopeStatus);
  const visibleBookings = bookings.filter((booking) => ['confirmed', 'checked_in'].includes(booking.status)).slice().sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

  return <section className="page-content academic-management">
    <div className="page-intro"><div><p className="eyebrow">CONFLICT-AWARE PLANNING</p><h2>Weekly timetable.</h2><p>One term-specific view of scheduled classes from the same records used for availability.</p></div>{term && <StatusBadge status={scopeStatus || 'not_configured'} />}</div>
    {!academicSchema.available ? <div className="academic-schema-state" role="status"><div><strong>{academicSchema.schemaMissing ? 'Academic timetable migration required' : 'Academic timetable is unavailable'}</strong><p>{academicSchema.error || 'No academic-term schedule is available. Empty rows are not treated as free.'}</p></div></div> : <>
      <div className="academic-heading-row academic-timetable-filters"><label className="compact-select">Academic term<select value={termId} onChange={(event) => { setTermSelection(event.target.value); setSectionSelection(''); }}><option value="">Choose term</option>{terms.map((item) => <option key={item.id} value={item.id}>{years.find((year) => year.id === item.academic_year_id)?.name || 'Academic year'} · {item.name}</option>)}</select></label><label className="compact-select">Section<select value={sectionId} onChange={(event) => setSectionSelection(event.target.value)}><option value="">All sections</option>{termSections.map((section) => <option key={section.id} value={section.id}>{section.code} · {section.name}</option>)}</select></label></div>
      {!term ? <div className="academic-empty"><strong>No academic term is configured.</strong></div> : !termPeriods.length ? <div className="academic-empty"><strong>No canonical periods have been configured for this term.</strong></div> : <><div className="availability-notice" role="status">{isComplete ? `Completeness: ${scopeStatus}.` : 'Completeness has not been confirmed for this scope. Empty cells are marked unknown, not free.'}</div><div className="academic-grid-wrap"><div className="academic-grid"><div className="academic-grid-head">Period</div>{weekdays.map(([, label]) => <div className="academic-grid-head" key={label}>{label.slice(0, 3)}</div>)}{termPeriods.map((period) => <React.Fragment key={period.id}><div className="academic-grid-period"><strong>{period.display_name}</strong><small>{shortTime(period.starts_at)}–{shortTime(period.ends_at)}</small></div>{weekdays.map(([day]) => {
        const entry = termEntries.find((item) => Number(item.day_of_week) === day && item.academic_period_id === period.id && (!sectionId || item.section_id === sectionId));
        const room = entry && rooms.find((item) => item.id === entry.room_id);
        const section = entry && sections.find((item) => item.id === entry.section_id);
        const subject = entry && subjects.find((item) => item.id === entry.subject_id);
        const faculty = entry && profiles.find((item) => item.id === entry.faculty_id);
        return <div className={entry ? 'academic-grid-cell occupied' : 'academic-grid-cell'} key={`${period.id}-${day}`}>{entry ? <><strong>{subject?.name || entry.subject}</strong><small>{section?.code || 'Section'} · {faculty?.display_name || 'Faculty'} · {room?.code || 'Room'}</small></> : <span>{isComplete ? 'No class' : 'Unknown'}</span>}</div>;
      })}</React.Fragment>)}</div></div></>}
    </>}
    <div className="utilization-card academic-bookings-card"><div className="card-heading"><div><p className="eyebrow">YOUR RESERVATIONS</p><h3>Personal booking schedule</h3></div></div>{visibleBookings.length ? visibleBookings.map((booking) => <div className="schedule-row" key={booking.id}><span className="schedule-time">{new Date(booking.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><span className="schedule-line" /><div><strong>{booking.title}</strong><p>{rooms.find((room) => room.id === booking.room_id)?.code || 'Room'} · {rooms.find((room) => room.id === booking.room_id)?.name || 'Details unavailable'}</p></div><span className={`status ${booking.status}`}>{booking.status.replace('_', ' ')}</span></div>) : <p className="muted">You have no active reservation records to show.</p>}</div>
  </section>;
}

export { RoomClassificationPanel, AcademicTimetableView };
export default AcademicManagement;
