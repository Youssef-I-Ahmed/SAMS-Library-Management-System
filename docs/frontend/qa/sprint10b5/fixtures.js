/* Audit instrumentation only. Never imported by application source.
 * Synthetic, labelled UI fixtures; not library holdings or institutional facts.
 * Every API call is intercepted. Every mutation is rejected locally. */
(() => {
  const params = new URLSearchParams(location.search);
  const role = location.pathname.startsWith('/management') ? 'MANAGEMENT' : location.pathname.startsWith('/librarian') ? 'LIBRARIAN' : 'STUDENT';
  const language = (params.get('__lang') || localStorage.getItem('sams.language')) === 'ar' ? 'ar' : 'en';
  const theme = (params.get('__theme') || localStorage.getItem('sams.theme')) === 'dark' ? 'dark' : 'light';
  const state = params.get('__state') || 'normal';
  localStorage.setItem('sams.language', language);
  localStorage.setItem('sams.theme', theme);
  sessionStorage.setItem('sams.devAccessToken', 'audit-fixture-only-token');
  const ar = language === 'ar';
  const text = (en, arabic) => ar ? arabic : en;
  const branches = [
    { id: 'audit-main', code: 'AUDIT-M', name: text('Main branch — audit fixture', 'الفرع الرئيسي — عينة تدقيق'), location: text('Demonstration location', 'موقع تجريبي'), isActive: true },
    { id: 'audit-second', code: 'AUDIT-R', name: text('Research branch — audit fixture', 'فرع البحث — عينة تدقيق'), isActive: true }
  ];
  const category = { id: 'audit-category', name: text('Management sciences', 'العلوم الإدارية') };
  const dewey = { id: 'audit-dewey', code: '658', name: text('Management', 'الإدارة') };
  const titles = ar ? ['مناهج البحث — عينة تدقيق', 'الاقتصاد المؤسسي — عينة تدقيق', 'دراسة أكاديمية — عينة تدقيق', 'مشروع التخرج — عينة تدقيق', 'دراسة موسعة في الإدارة والتحول الرقمي والتخطيط الاستراتيجي — عينة تدقيق', 'سجل ببيانات محدودة — عينة تدقيق'] : ['Research Methods — audit fixture', 'Institutional Economics — audit fixture', 'Academic Research — audit fixture', 'Graduation Project — audit fixture', 'An extended study of management, digital transformation and strategic planning — audit fixture', 'Minimal metadata — audit fixture'];
  const items = titles.map((title, i) => ({
    id: `audit-item-${i + 1}`, type: ['BOOK', 'BOOK', 'THESIS', 'PROJECT', 'BOOK', 'BOOK'][i], title, version: 1, isActive: true,
    ...(i === 5 ? {} : { category, deweyClassification: dewey, callNumber: `658 AUD ${i + 1}`, language: i === 2 ? 'ar' : 'en', publicationYear: 2024,
      abstractDescription: text('Audit fixture description. This is not a real publication record or evidence of physical inventory.', 'وصف عينة تدقيق؛ ليس سجلًا حقيقيًا لمنشور أو دليلًا على مخزون فعلي.'),
      itemContributors: [{ role: 'AUTHOR', contributor: { id: `audit-author-${i}`, fullName: text('Audit contributor', 'مساهم عينة التدقيق') } }],
      ...(i === 2 || i === 3 ? { academicWorkDetails: { academicYear: '2023/2024', faculty: { id: 'audit-faculty', name: text('Audit faculty', 'كلية تجريبية') }, department: { id: 'audit-department', name: text('Audit department', 'قسم تجريبي') } } } : { bookDetails: { isbn: null, publisher: text('Audit publisher', 'ناشر تجريبي'), edition: null } }) }),
    availability: { totalCopies: i < 2 ? 2 : 0, availableCopies: i === 0 ? 1 : 0, available: i === 0,
      branches: i < 2 ? [{ branch: branches[i], totalCopies: 2, availableCopies: i === 0 ? 1 : 0, available: i === 0 }] : [] },
    reservationReadiness: { hasAvailableCopy: i === 0, candidateBranches: i === 0 ? [{ branch: branches[0], availableCopies: 1 }] : [] }
  }));
  const students = [0, 1, 2].map(i => ({ id: `audit-student-${i}`, studentId: `AUDIT-2026-${i + 1}`, academicStatus: 'ACTIVE', faculty: { name: text('Audit faculty', 'كلية تجريبية') }, user: { id: `audit-reader-${i}`, displayName: text(`Audit reader ${i + 1}`, `قارئ عينة التدقيق ${i + 1}`), universityEmail: `audit${i + 1}@example.test`, isActive: true } }));
  const copies = [0, 1, 2, 3, 4].map(i => ({ id: `audit-copy-${i}`, version: 1, item: items[i % 2], branch: branches[i % 2], itemId: items[i % 2].id, branchId: branches[i % 2].id, copyCode: `AUDIT-ONLY-${i + 1}`, barcode: `AUDIT-${i + 1}`, shelfLocation: 'AUDIT FIXTURE — NOT A REAL SHELF', status: i === 0 ? 'AVAILABLE' : i === 3 ? 'DAMAGED' : 'UNAVAILABLE', condition: i === 3 ? 'DAMAGED' : 'GOOD' }));
  for (const item of items) {
    const own = copies.filter(copy => copy.itemId === item.id);
    const byBranch = branches.map(branch => { const rows = own.filter(copy => copy.branchId === branch.id); const availableCopies = rows.filter(copy => copy.status === 'AVAILABLE').length; return { branch, totalCopies: rows.length, availableCopies, available: availableCopies > 0 }; }).filter(entry => entry.totalCopies > 0);
    const availableCopies = own.filter(copy => copy.status === 'AVAILABLE').length;
    item.availability = { totalCopies: own.length, availableCopies, available: availableCopies > 0, branches: byBranch };
    item.reservationReadiness = { hasAvailableCopy: availableCopies > 0, candidateBranches: byBranch.filter(entry => entry.available).map(({ branch, availableCopies }) => ({ branch, availableCopies })) };
  }
  const reservations = ['ACTIVE', 'PENDING', 'EXPIRED'].map((status, i) => ({ id: `audit-hold-${i}`, status, item: items[i % 2], student: students[i], branch: branches[i % 2], allocatedCopy: i === 0 ? copies[4] : null, reservedAt: i === 2 ? '2026-08-01T09:00:00Z' : `2026-10-${23 + i}T09:00:00Z`, expiresAt: i === 2 ? '2026-08-03T09:00:00Z' : '2026-10-26T09:00:00Z', isHoldOverdue: false }));
  const borrowings = ['ACTIVE', 'ACTIVE', 'RETURNED'].map((status, i) => { const copy = copies[i === 1 ? 2 : 1]; return { id: `audit-loan-${i}`, status, item: copy.item, copy, branch: copy.branch, student: students[i], borrowedAt: i === 2 ? '2026-10-10T09:00:00Z' : `2026-10-${20 + i}T09:00:00Z`, dueAt: i === 1 ? '2026-10-23T09:00:00Z' : '2026-10-28T09:00:00Z', returnedAt: i === 2 ? '2026-10-18T10:00:00Z' : null, isOverdue: i === 1, overdueDays: i === 1 ? 1 : 0, notes: null }; });
  const visits = [0, 1, 2].map(i => ({ id: `audit-visit-${i}`, student: students[i], branch: branches[i % 2], source: 'MANUAL', checkedInAt: `2026-10-${i === 0 ? 23 : 24}T09:00:00Z`, checkedOutAt: i === 2 ? null : `2026-10-${i === 0 ? 23 : 24}T10:00:00Z`, durationMinutes: i === 2 ? 0 : 60, isOpen: i === 2 }));
  const overview = { catalog: { activeItems: items.length, physicalCopies: copies.length, availableCopies: copies.filter(x => x.status === 'AVAILABLE').length, availabilityRatePercent: copies.filter(x => x.status === 'AVAILABLE').length / copies.length * 100 }, circulation: { activeLoans: borrowings.filter(x => x.status === 'ACTIVE').length, overdueLoans: borrowings.filter(x => x.isOverdue).length, overdueLoanRatePercent: borrowings.filter(x => x.isOverdue).length / borrowings.filter(x => x.status === 'ACTIVE').length * 100 }, reservations: { activeHolds: reservations.filter(x => ['ACTIVE', 'PENDING'].includes(x.status)).length }, visits: { visitsInPeriod: visits.length } };
  console.assert(overview.catalog.availableCopies === copies.filter(x => x.status === 'AVAILABLE').length);
  console.assert(overview.circulation.activeLoans === borrowings.filter(x => x.status === 'ACTIVE').length);
  console.assert(overview.reservations.activeHolds === reservations.filter(x => ['ACTIVE', 'PENDING'].includes(x.status)).length);
  const nativeFetch = window.fetch.bind(window);
  const audit = window.__samsAudit = { role, language, theme, state, requests: [], blockedMutations: [], fixtures: true, unknown: [] };
  const paged = (data, url) => { const page = Number(url.searchParams.get('page') || 1), pageSize = Number(url.searchParams.get('pageSize') || 20); return { data: data.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total: data.length, totalPages: Math.ceil(data.length / pageSize), hasPreviousPage: page > 1, hasNextPage: page * pageSize < data.length } }; };
  const response = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'x-request-id': 'AUDIT-FIXTURE' } }));
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const method = String(options.method || input?.method || 'GET').toUpperCase();
    if (!url.pathname.startsWith('/api/v1/')) {
      if (url.origin === location.origin && method === 'GET') return nativeFetch(input, options);
      audit.unknown.push(`${method} ${url.href}`); throw new Error('Audit blocks non-local requests');
    }
    const path = url.pathname.replace('/api/v1', '');
    audit.requests.push({ method, path, query: Object.fromEntries(url.searchParams) });
    if (method !== 'GET') { audit.blockedMutations.push({ method, path }); return response({ error: { code: 'AUDIT_READ_ONLY', message: text('Read-only audit: changes are disabled.', 'تدقيق للقراءة فقط: التغييرات معطلة.') } }, 405); }
    if (path === '/auth/me') return response({ user: { id: role === 'STUDENT' ? students[2].user.id : 'audit-user', roles: [role], displayName: role === 'STUDENT' ? students[2].user.displayName : text(`${role === 'LIBRARIAN' ? 'Librarian' : 'Management'} audit sample`, 'مستخدم عينة التدقيق'), universityEmail: role === 'STUDENT' ? students[2].user.universityEmail : 'audit@example.test', ...(role === 'STUDENT' ? { student: students[2] } : {}) } });
    if (state === 'loading') return new Promise(() => {});
    if (state === 'error') return response({ error: { code: 'AUDIT_FAILURE', message: text('Intentional audit error fixture.', 'عينة خطأ مقصودة للتدقيق.') } }, 503);
    const empty = state === 'empty';
    if (path === '/discovery/facets') return response({ data: { types: ['BOOK', 'THESIS', 'PROJECT'].map(value => ({ value, count: items.filter(x => x.type === value).length })), categories: [{ ...category, count: 5 }], deweyClassifications: [{ ...dewey, count: 5 }], languages: [{ value: 'en', count: 4 }, { value: 'ar', count: 1 }], publicationYears: [{ value: 2024, count: 5 }], branches: branches.map(branch => ({ ...branch, availableItems: branch === branches[0] ? 1 : 0, totalItems: 1 })) } });
    if (path === '/discovery/items') { let data = empty ? [] : items; const q = url.searchParams.get('q'); if (q) data = data.filter(x => x.title.toLowerCase().includes(q.toLowerCase())); if (url.searchParams.get('type')) data = data.filter(x => x.type === url.searchParams.get('type')); if (url.searchParams.get('availableOnly') === 'true') data = data.filter(x => x.availability.available); return response(paged(data, url)); }
    if (path.startsWith('/discovery/items/')) return empty ? response({ error: { code: 'NOT_FOUND', message: 'Audit missing-record fixture' } }, 404) : response({ data: items.find(x => x.id === path.split('/').at(-1)) || items[0] });
    if (path.startsWith('/master-data/branches')) return response({ data: branches });
    if (path === '/master-data/faculties') return response({ data: [{ id: 'audit-faculty', name: text('Audit faculty', 'كلية تجريبية') }] });
    if (path === '/master-data/departments') return response({ data: [{ id: 'audit-department', facultyId: 'audit-faculty', name: text('Audit department', 'قسم تجريبي') }] });
    if (path === '/catalog-master/categories') return response({ data: [category] });
    if (path === '/catalog-master/dewey') return response({ data: [dewey] });
    if (path === '/catalog/items') return response(paged(empty ? [] : items, url));
    if (path.startsWith('/catalog/items/')) return response({ data: items.find(x => x.id === path.split('/').at(-1)) || items[0] });
    if (path === '/inventory/copies') return response(paged(empty ? [] : copies, url));
    if (path === '/students') return response(paged(empty ? [] : students, url));
    if (path === '/reservations' || path === '/reservations/me') { let data = empty ? [] : reservations; if (path.endsWith('/me')) data = data.filter(x => x.student.id === students[2].id); if (url.searchParams.get('status')) data = data.filter(x => x.status === url.searchParams.get('status')); return response(paged(data, url)); }
    if (path === '/borrowings' || path === '/borrowings/me') { let data = empty ? [] : borrowings; if (path.endsWith('/me')) data = data.filter(x => x.student.id === students[2].id); if (url.searchParams.get('status')) data = data.filter(x => x.status === url.searchParams.get('status')); if (url.searchParams.get('overdueOnly') === 'true') data = data.filter(x => x.isOverdue); return response(paged(data, url)); }
    if (path === '/visits') return response(paged(empty ? [] : visits.filter(x => url.searchParams.get('openOnly') !== 'true' || x.isOpen), url));
    if (path === '/analytics/overview') return response({ data: empty ? { catalog: { activeItems: 0, physicalCopies: 0, availableCopies: 0, availabilityRatePercent: 0 }, circulation: { activeLoans: 0, overdueLoans: 0, overdueLoanRatePercent: 0 }, reservations: { activeHolds: 0 }, visits: { visitsInPeriod: 0 } } : overview });
    if (path === '/analytics/trends') {
      const start = new Date(url.searchParams.get('from') || '2026-09-25'), end = new Date(url.searchParams.get('to') || '2026-10-25');
      const data = []; for (let day = start, i = 0; day < end && i < 40; day = new Date(day.getTime() + 86400000), i++) {
        const key = day.toISOString().slice(0, 10), same = value => value?.slice(0, 10) === key;
        data.push({ bucketStart: day.toISOString(), reservationsCreated: empty ? 0 : reservations.filter(x => same(x.reservedAt)).length, borrowingsStarted: empty ? 0 : borrowings.filter(x => same(x.borrowedAt)).length, returns: empty ? 0 : borrowings.filter(x => same(x.returnedAt)).length, visits: empty ? 0 : visits.filter(x => same(x.checkedInAt)).length });
      }
      return response({ data: { data } });
    }
    if (path === '/analytics/top-items') return response({ data: { data: empty ? [] : items.slice(0, 2).map((item, i) => ({ item, rank: i + 1, count: (url.searchParams.get('metric') === 'RESERVATIONS' ? reservations : borrowings).filter(x => x.item.id === item.id).length })).sort((a, b) => b.count - a.count).map((x, i) => ({ ...x, rank: i + 1 })) } });
    if (path === '/analytics/branches') return response({ data: { data: empty ? [] : branches.map(branch => ({ branch, catalog: { physicalCopies: copies.filter(x => x.branch.id === branch.id).length, availableCopies: copies.filter(x => x.branch.id === branch.id && x.status === 'AVAILABLE').length }, circulation: { activeLoans: borrowings.filter(x => x.branch.id === branch.id && x.status === 'ACTIVE').length, overdueLoans: borrowings.filter(x => x.branch.id === branch.id && x.isOverdue).length, borrowingsStartedInPeriod: borrowings.filter(x => x.branch.id === branch.id).length }, visits: { visitsInPeriod: visits.filter(x => x.branch.id === branch.id).length } })) } });
    audit.unknown.push(`${method} ${path}`);
    return response({ error: { code: 'AUDIT_UNMAPPED', message: `Audit fixture not mapped: ${path}` } }, 501);
  };
})();
