export const ITEM_TYPES = ['BOOK', 'THESIS', 'PROJECT'];
export const COPY_STATUSES = ['AVAILABLE', 'UNAVAILABLE', 'DAMAGED', 'LOST', 'ARCHIVED'];
export const COPY_CONDITIONS = ['GOOD', 'FAIR', 'DAMAGED'];
export const ACADEMIC_STATUSES = ['ACTIVE', 'GRADUATED', 'SUSPENDED', 'INACTIVE'];

export function formatPercent(value) {
  const n = Number(value || 0);
  return `${n.toFixed(n % 1 === 0 ? 0 : 2)}%`;
}

export function itemStatusTone(item) {
  return item?.isActive ? 'success' : 'neutral';
}

export function copyStatusTone(status) {
  if (status === 'AVAILABLE') return 'success';
  if (status === 'DAMAGED' || status === 'LOST') return 'danger';
  if (status === 'ARCHIVED') return 'neutral';
  return 'warning';
}

export function studentStatusTone(student) {
  if (!student?.user?.isActive) return 'neutral';
  if (student?.academicStatus === 'ACTIVE') return 'success';
  if (student?.academicStatus === 'SUSPENDED') return 'danger';
  return 'warning';
}

export function emptyItemDraft() {
  return {
    id: null, version: null, type: 'BOOK', title: '', categoryId: '',
    deweyClassificationId: '', deweyCodeRaw: '', callNumber: '', language: '',
    publicationYear: '', abstract: '', isActive: true, isbn: '', publisher: '',
    edition: '', facultyId: '', departmentId: '', academicYear: ''
  };
}

export function itemToDraft(item) {
  return {
    id: item.id, version: item.version, type: item.type, title: item.title || '',
    categoryId: item.category?.id || '', deweyClassificationId: item.deweyClassification?.id || '',
    deweyCodeRaw: item.deweyCodeRaw || '', callNumber: item.callNumber || '', language: item.language || '',
    publicationYear: item.publicationYear || '', abstract: item.abstractDescription || '', isActive: item.isActive,
    isbn: item.bookDetails?.isbn || '', publisher: item.bookDetails?.publisher || '', edition: item.bookDetails?.edition || '',
    facultyId: item.academicWorkDetails?.faculty?.id || '', departmentId: item.academicWorkDetails?.department?.id || '',
    academicYear: item.academicWorkDetails?.academicYear || ''
  };
}

export function emptyCopyDraft() {
  return {
    id: null,
    version: null,
    itemId: '',
    branchId: '',
    originalBranchId: '',
    copyCode: '',
    barcode: '',
    shelfLocation: '',
    status: 'AVAILABLE',
    originalStatus: 'AVAILABLE',
    condition: 'GOOD'
  };
}

export function copyToDraft(copy) {
  return {
    id: copy.id,
    version: copy.version,
    itemId: copy.item.id,
    branchId: copy.branch.id,
    originalBranchId: copy.branch.id,
    copyCode: copy.copyCode || '',
    barcode: copy.barcode || '',
    shelfLocation: copy.shelfLocation || '',
    status: copy.status,
    originalStatus: copy.status,
    condition: copy.condition || 'GOOD'
  };
}

export function trendMax(rows = []) {
  return Math.max(1, ...rows.flatMap((r) => [r.reservationsCreated || 0, r.borrowingsStarted || 0, r.returns || 0, r.visits || 0]));
}
