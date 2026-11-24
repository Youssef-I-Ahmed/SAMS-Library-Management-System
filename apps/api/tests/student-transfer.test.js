import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/prisma.js', () => ({ prisma: {} }));
const saved = [];
vi.mock('../src/modules/students/students.service.js', () => ({
  saveStudent: vi.fn(async (record, options) => {
    saved.push({ record, options });
    if (record.studentId === 'FAIL') throw Object.assign(new Error('x'), { code: 'P2002' });
    return { action: options.mode === 'create' ? 'created' : 'updated', studentId: record.studentId };
  })
}));

const { analyzeStudentImport, buildStudentTemplate, commitStudentImport, suggestStudentMapping, validateStudentRow } =
  await import('../src/modules/students/student-transfer.js');
const { parseTable, serializeTable } = await import('../src/modules/catalog-transfer/tabular.js');

const units = new Map([['كليه الحاسبات', { name: 'كلية الحاسبات', isActive: true,
  departments: new Map([['نظم المعلومات', { name: 'نظم المعلومات', isActive: true }]]) }]]);

function fakeDb() {
  return {
    faculty: { findMany: async () => [{ id: 'f1', name: 'كلية الحاسبات', isActive: true,
      departments: [{ name: 'نظم المعلومات', isActive: true }] }] },
    student: { findMany: async () => [{ studentId: '100', userId: 'u1', user: { displayName: 'Old', universityEmail: 'old@uni.edu' } }] },
    user: { findMany: async () => [
      { id: 'u1', universityEmail: 'old@uni.edu', isProtected: false, student: { studentId: '100' }, userRoles: [{ role: { name: 'STUDENT' } }] },
      { id: 'u9', universityEmail: 'librarian@uni.edu', isProtected: true, student: null, userRoles: [{ role: { name: 'LIBRARIAN' } }] }
    ] }
  };
}

describe('student files', () => {
  it('maps Arabic headers', () => {
    expect(suggestStudentMapping(['الرقم الجامعي', 'اسم الطالب', 'الإيميل', 'الكلية', 'ملاحظات']))
      .toEqual({ 'الرقم الجامعي': 'student_id', 'اسم الطالب': 'name', 'الإيميل': 'email', 'الكلية': 'faculty', 'ملاحظات': '' });
  });

  it('validates a row and resolves faculty names loosely', () => {
    const mapping = { id: 'student_id', n: 'name', e: 'email', f: 'faculty', d: 'department', s: 'academic_status', a: 'active' };
    const ok = validateStudentRow({ id: '٢٠٢١', n: 'Mona  Ali', e: 'Mona@Uni.edu', f: 'كليه الحاسبات', d: 'نظم المعلومات', s: 'خريج', a: 'لا' }, mapping, units);
    expect(ok.errors).toEqual([]);
    expect(ok.record).toEqual({ studentId: '2021', displayName: 'Mona Ali', universityEmail: 'mona@uni.edu',
      facultyName: 'كلية الحاسبات', departmentName: 'نظم المعلومات', academicStatus: 'GRADUATED', isActive: false });
    const bad = validateStudentRow({ n: 'x', e: 'nope', f: 'Medicine', s: 'maybe', a: 'perhaps' }, mapping, units);
    expect(bad.errors.map((error) => error.code).sort())
      .toEqual(['INVALID_BOOLEAN', 'INVALID_EMAIL', 'INVALID_STATUS', 'REQUIRED', 'TOO_SHORT', 'UNKNOWN_FACULTY']);
  });

  it('builds a template that maps back to every column', () => {
    const { headers } = parseTable(buildStudentTemplate('xlsx'), 'xlsx');
    expect(Object.values(suggestStudentMapping(headers)).every(Boolean)).toBe(true);
  });
});

describe('student import', () => {
  const file = serializeTable('csv', ['student_id', 'name', 'email'], [
    { student_id: '200', name: 'New Student', email: 'new@uni.edu' },
    { student_id: '100', name: 'Updated Name', email: 'old@uni.edu' },
    { student_id: '300', name: 'Takes staff email', email: 'librarian@uni.edu' },
    { student_id: '200', name: 'Repeat', email: 'other@uni.edu' },
    { student_id: '400', name: 'Uses old email', email: 'old@uni.edu' },
    { student_id: 'FAIL', name: 'Will fail', email: 'fail@uni.edu' }
  ]);

  it('previews new, existing and invalid rows', async () => {
    const result = await analyzeStudentImport(file, { format: 'csv' }, fakeDb());
    expect(result.summary).toEqual({ total: 6, new: 2, existing: 1, invalid: 3 });
    expect(result.rows.map((row) => row.errors[0]?.code ?? row.status))
      .toEqual(['new', 'existing', 'PROTECTED_ACCOUNT', 'DUPLICATE_IN_FILE', 'DUPLICATE_IN_FILE', 'new']);
  });

  it('creates new students, skips existing unless asked, and reports failures', async () => {
    saved.length = 0;
    const actor = { id: 'lib' };
    const skip = await commitStudentImport(file, { format: 'csv', actor }, fakeDb());
    expect(skip.report).toMatchObject({ created: 1, updated: 0, skippedExisting: 1, invalid: 3, failed: [{ rowNumber: 7, code: 'UNEXPECTED_ERROR' }] });
    expect(saved[0].options).toMatchObject({ mode: 'create', actor, source: 'file-import' });
    const update = await commitStudentImport(file, { format: 'csv', updateExisting: true, actor }, fakeDb());
    expect(update.report).toMatchObject({ created: 1, updated: 1, skippedExisting: 0 });
  });
});
