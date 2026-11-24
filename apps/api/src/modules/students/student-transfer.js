// Student accounts as files: template, export, and a previewed import.
// Each committed row goes through saveStudent, which keeps every account rule.
import { AcademicStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { headerKey, normalizeText } from '../catalog-transfer/catalog-columns.js';
import { parseTable, serializeTable } from '../catalog-transfer/tabular.js';
import { saveStudent } from './students.service.js';

export const MAX_STUDENT_ROWS = 5000;
const MAX_EXPORT_ROWS = 50000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const STUDENT_COLUMNS = [
  { key: 'student_id', ar: 'الرقم الجامعي', en: 'Student ID', required: true,
    aliases: ['studentid', 'id', 'كود الطالب', 'رقم الطالب', 'الكود', 'رقم القيد', 'student code', 'student number'] },
  { key: 'name', ar: 'الاسم', en: 'Name', required: true,
    aliases: ['displayname', 'full name', 'student name', 'اسم الطالب', 'الاسم بالكامل', 'الاسم الكامل'] },
  { key: 'email', ar: 'البريد الجامعي', en: 'University email', required: true,
    aliases: ['universityemail', 'e-mail', 'mail', 'الايميل', 'الإيميل', 'البريد الالكتروني', 'البريد الإلكتروني', 'البريد'] },
  { key: 'faculty', ar: 'الكلية', en: 'Faculty', aliases: ['facultyname', 'college', 'كليه'] },
  { key: 'department', ar: 'القسم', en: 'Department', aliases: ['departmentname', 'major', 'التخصص', 'الشعبة'] },
  { key: 'academic_status', ar: 'الحالة الأكاديمية', en: 'Academic status',
    aliases: ['academicstatus', 'status', 'الحالة', 'حالة القيد'] },
  { key: 'active', ar: 'الحساب مفعل', en: 'Account active',
    aliases: ['isactive', 'enabled', 'مفعل', 'نشط', 'الحساب نشط', 'تفعيل الحساب'] }
];
const COLUMN_KEYS = STUDENT_COLUMNS.map((column) => column.key);

const HEADER_INDEX = new Map();
for (const column of STUDENT_COLUMNS) {
  for (const name of [column.key, column.ar, column.en, ...column.aliases]) HEADER_INDEX.set(headerKey(name), column.key);
}

export function suggestStudentMapping(headers) {
  const used = new Set();
  return Object.fromEntries(headers.map((header) => {
    const key = HEADER_INDEX.get(headerKey(header));
    if (!key || used.has(key)) return [header, ''];
    used.add(key);
    return [header, key];
  }));
}

const STATUS_VALUES = new Map([
  ...['active', 'enrolled', 'نشط', 'مقيد', 'منتظم', 'طالب'].map((v) => [v, 'ACTIVE']),
  ...['graduated', 'graduate', 'alumni', 'خريج', 'متخرج'].map((v) => [v, 'GRADUATED']),
  ...['suspended', 'موقوف', 'معلق', 'موقوفقيده'].map((v) => [v, 'SUSPENDED']),
  ...['inactive', 'withdrawn', 'غيرنشط', 'منقطع', 'منسحب', 'مفصول'].map((v) => [v, 'INACTIVE'])
]);
const parseStatus = (value) => STATUS_VALUES.get(headerKey(value)) ?? null;

const BOOLEAN_VALUES = new Map([
  ...['true', 'yes', 'y', '1', 'active', 'enabled', 'نعم', 'ايوه', 'مفعل', 'نشط'].map((v) => [v, true]),
  ...['false', 'no', 'n', '0', 'inactive', 'disabled', 'لا', 'موقوف', 'غيرمفعل', 'معطل'].map((v) => [v, false])
]);
const parseBoolean = (value) => BOOLEAN_VALUES.get(headerKey(value)) ?? null;

/** Lookups for faculties and departments, matched loosely by Arabic-normalized name. */
async function loadAcademicUnits(db) {
  const faculties = await db.faculty.findMany({
    select: { id: true, name: true, isActive: true, departments: { select: { name: true, isActive: true } } }
  });
  return new Map(faculties.map((faculty) => [normalizeText(faculty.name), {
    name: faculty.name,
    isActive: faculty.isActive,
    departments: new Map(faculty.departments.map((department) => [normalizeText(department.name), department]))
  }]));
}

/** Turns one file row into a saveStudent record, or reports what is wrong with it. */
export function validateStudentRow(values, mapping, units) {
  const raw = {};
  for (const [header, key] of Object.entries(mapping)) {
    if (key && values[header] !== undefined && values[header] !== '') raw[key] = String(values[header]).trim();
  }
  const errors = [];
  const fail = (field, code) => errors.push({ field, code });
  const record = {};

  if (!raw.student_id) fail('student_id', 'REQUIRED');
  else if (raw.student_id.length > 80) fail('student_id', 'TOO_LONG');
  else record.studentId = normalizeText(raw.student_id) === raw.student_id.toLowerCase()
    ? raw.student_id : raw.student_id.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

  if (!raw.name) fail('name', 'REQUIRED');
  else if (raw.name.length < 2) fail('name', 'TOO_SHORT');
  else if (raw.name.length > 180) fail('name', 'TOO_LONG');
  else record.displayName = raw.name.replace(/\s+/g, ' ');

  if (!raw.email) fail('email', 'REQUIRED');
  else if (!EMAIL.test(raw.email) || raw.email.length > 254) fail('email', 'INVALID_EMAIL');
  else record.universityEmail = raw.email.toLowerCase();

  if (raw.faculty) {
    const faculty = units.get(normalizeText(raw.faculty));
    if (!faculty) fail('faculty', 'UNKNOWN_FACULTY');
    else if (!faculty.isActive) fail('faculty', 'INACTIVE_FACULTY');
    else {
      record.facultyName = faculty.name;
      if (raw.department) {
        const department = faculty.departments.get(normalizeText(raw.department));
        if (!department) fail('department', 'UNKNOWN_DEPARTMENT');
        else if (!department.isActive) fail('department', 'INACTIVE_DEPARTMENT');
        else record.departmentName = department.name;
      }
    }
  } else if (raw.department) {
    fail('department', 'FACULTY_REQUIRED');
  }

  if (raw.academic_status) {
    const status = parseStatus(raw.academic_status);
    if (!status) fail('academic_status', 'INVALID_STATUS');
    else record.academicStatus = status;
  }
  if (raw.active) {
    const active = parseBoolean(raw.active);
    if (active === null) fail('active', 'INVALID_BOOLEAN');
    else record.isActive = active;
  }
  return { record, errors };
}

/** Reads the file and classifies every row; writes nothing. */
export async function analyzeStudentImport(buffer, { format, mapping: requested }, db = prisma) {
  const { headers, records } = parseTable(buffer, format);
  if (records.length > MAX_STUDENT_ROWS) {
    throw new AppError(400, 'IMPORT_TOO_LARGE', `A file can hold at most ${MAX_STUDENT_ROWS} students.`);
  }
  const suggested = suggestStudentMapping(headers);
  const mapping = Object.fromEntries(headers.map((header) => {
    const key = requested?.[header];
    return [header, typeof key === 'string' && (key === '' || COLUMN_KEYS.includes(key)) ? key : suggested[header]];
  }));
  const mapped = new Set(Object.values(mapping).filter(Boolean));
  const missingRequired = STUDENT_COLUMNS.filter((column) => column.required && !mapped.has(column.key)).map((column) => column.key);

  const units = await loadAcademicUnits(db);
  const rows = records.map(({ rowNumber, values }) => ({ rowNumber, ...validateStudentRow(values, mapping, units) }));

  // Look up existing accounts by student ID and by email in two queries.
  const ids = [...new Set(rows.map((row) => row.record.studentId).filter(Boolean))];
  const emails = [...new Set(rows.map((row) => row.record.universityEmail).filter(Boolean))];
  const [students, users] = await Promise.all([
    ids.length ? db.student.findMany({ where: { studentId: { in: ids } },
      select: { studentId: true, userId: true, user: { select: { universityEmail: true, displayName: true } } } }) : [],
    emails.length ? db.user.findMany({ where: { universityEmail: { in: emails, mode: 'insensitive' } },
      select: { id: true, universityEmail: true, isProtected: true, student: { select: { studentId: true } },
        userRoles: { select: { role: { select: { name: true } } } } } }) : []
  ]);
  const studentById = new Map(students.map((student) => [student.studentId, student]));
  const userByEmail = new Map(users.map((user) => [user.universityEmail.toLowerCase(), user]));

  const seenIds = new Map();
  const seenEmails = new Map();
  for (const row of rows) {
    const { record } = row;
    if (record.studentId) {
      const key = record.studentId.toLowerCase();
      if (seenIds.has(key)) row.errors.push({ field: 'student_id', code: 'DUPLICATE_IN_FILE', rowNumber: seenIds.get(key) });
      else seenIds.set(key, row.rowNumber);
    }
    if (record.universityEmail) {
      if (seenEmails.has(record.universityEmail)) row.errors.push({ field: 'email', code: 'DUPLICATE_IN_FILE', rowNumber: seenEmails.get(record.universityEmail) });
      else seenEmails.set(record.universityEmail, row.rowNumber);
    }
    const existing = record.studentId ? studentById.get(record.studentId) : null;
    const owner = record.universityEmail ? userByEmail.get(record.universityEmail) : null;
    if (owner) {
      const staff = owner.isProtected || owner.userRoles.some(({ role }) => role.name !== 'STUDENT');
      if (staff) row.errors.push({ field: 'email', code: 'PROTECTED_ACCOUNT' });
      else if (owner.student?.studentId !== record.studentId) row.errors.push({ field: 'email', code: 'EMAIL_ALREADY_IN_USE' });
    }
    row.status = row.errors.length ? 'invalid' : existing ? 'existing' : 'new';
    row.warnings = [];
    if (existing) {
      row.existing = { studentId: existing.studentId, name: existing.user.displayName, email: existing.user.universityEmail };
      // Updating would overwrite these, so say so before anyone chooses to update.
      if (record.universityEmail && record.universityEmail !== existing.user.universityEmail.toLowerCase()) {
        row.warnings.push({ field: 'email', code: 'EMAIL_WILL_CHANGE', from: existing.user.universityEmail });
      }
      if (record.displayName && record.displayName !== existing.user.displayName) {
        row.warnings.push({ field: 'name', code: 'NAME_WILL_CHANGE', from: existing.user.displayName });
      }
    }
  }

  const count = (status) => rows.filter((row) => row.status === status).length;
  return {
    headers, mapping, missingRequired,
    summary: { total: rows.length, new: count('new'), existing: count('existing'), invalid: count('invalid'),
      emailChanges: rows.filter((row) => row.warnings?.some((w) => w.code === 'EMAIL_WILL_CHANGE')).length },
    rows
  };
}

/** Creates new students and, if asked, updates existing ones. Each row stands alone. */
export async function commitStudentImport(buffer, { format, mapping, updateExisting = false, actor }, db = prisma) {
  const analysis = await analyzeStudentImport(buffer, { format, mapping }, db);
  if (analysis.missingRequired.length) {
    throw new AppError(400, 'MISSING_REQUIRED_COLUMNS', `Map these columns first: ${analysis.missingRequired.join(', ')}`);
  }
  const report = { total: analysis.summary.total, created: 0, updated: 0, skippedExisting: 0, invalid: analysis.summary.invalid, failed: [] };
  for (const row of analysis.rows) {
    if (row.status === 'invalid') continue;
    if (row.status === 'existing' && !updateExisting) { report.skippedExisting += 1; continue; }
    try {
      const result = await saveStudent(row.record, { mode: row.status === 'new' ? 'create' : 'update', actor, source: 'file-import', db });
      report[result.action] += 1;
    } catch (error) {
      report.failed.push({ rowNumber: row.rowNumber, code: error instanceof AppError ? error.code : 'UNEXPECTED_ERROR' });
    }
  }
  return { report, rows: analysis.rows.filter((row) => row.status === 'invalid') };
}

const INSTRUCTIONS = [
  ['التعليمات', 'Instructions'],
  ['الأعمدة المطلوبة: الرقم الجامعي، الاسم، البريد الجامعي.', 'Required columns: student_id, name, email.'],
  ['الكلية والقسم لازم يكونوا مسجلين في البيانات الأساسية بنفس الاسم.', 'Faculty and department must already exist in master data.'],
  ['الحالة الأكاديمية: ACTIVE أو GRADUATED أو SUSPENDED أو INACTIVE (أو نشط، خريج، موقوف، منقطع).',
    'academic_status: ACTIVE, GRADUATED, SUSPENDED or INACTIVE.'],
  ['الحساب مفعل: نعم أو لا. لو سبتها فاضية، الحساب الجديد بيبقى مفعل.', 'active: yes or no. Empty means a new account is active.'],
  ['الطالب الموجود بنفس الرقم الجامعي بيتحدث فقط لو اخترت "تحديث الموجودين".',
    'A row whose student ID already exists is updated only if you choose to update existing students.']
];

export function buildStudentTemplate(format) {
  const example = { student_id: '20210001', name: 'اسم الطالب', email: 'student@university.edu.eg',
    faculty: '', department: '', academic_status: 'ACTIVE', active: 'yes' };
  if (format === 'json') return serializeTable('json', COLUMN_KEYS, [example]);
  return serializeTable(format, COLUMN_KEYS, format === 'xlsx' ? [] : [],
    { sheetName: 'Students', extraSheets: format === 'xlsx' ? [{ name: 'Instructions', rows: INSTRUCTIONS, rightToLeft: true }] : [] });
}

export async function buildStudentExport({ format, search, academicStatus, includeInactive }, db = prisma) {
  const where = {
    ...(academicStatus ? { academicStatus } : {}),
    ...(includeInactive ? {} : { user: { isActive: true } }),
    ...(search ? { OR: [
      { studentId: { contains: search, mode: 'insensitive' } },
      { user: { universityEmail: { contains: search, mode: 'insensitive' } } },
      { user: { displayName: { contains: search, mode: 'insensitive' } } }
    ] } : {})
  };
  const total = await db.student.count({ where });
  if (total > MAX_EXPORT_ROWS) throw new AppError(400, 'EXPORT_TOO_LARGE', `Narrow the export to ${MAX_EXPORT_ROWS} students or fewer.`);
  const students = await db.student.findMany({
    where, orderBy: { studentId: 'asc' },
    select: { studentId: true, academicStatus: true,
      user: { select: { displayName: true, universityEmail: true, isActive: true } },
      faculty: { select: { name: true } }, department: { select: { name: true } } }
  });
  const rows = students.map((student) => ({
    student_id: student.studentId,
    name: student.user.displayName,
    email: student.user.universityEmail,
    faculty: student.faculty?.name ?? '',
    department: student.department?.name ?? '',
    academic_status: student.academicStatus,
    active: student.user.isActive ? 'yes' : 'no'
  }));
  return serializeTable(format, COLUMN_KEYS, rows, { sheetName: 'Students' });
}

export const ACADEMIC_STATUSES = Object.values(AcademicStatus);
