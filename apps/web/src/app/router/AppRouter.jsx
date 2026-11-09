import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AI_ASSISTANT_ENABLED } from '../../features/ai/ai-config.js';

import { RequireAuth, RequireRole, RootRedirect } from '../../auth/AuthGuards';
import { StudentShell } from '../../layouts/StudentShell';
import { StaffShell } from '../../layouts/StaffShell';

const lazyNamed = (loader, name) => lazy(() => loader().then((module) => ({ default: module[name] })));

const LoginPage = lazyNamed(() => import('../../pages/auth/LoginPage'), 'LoginPage');
const StudentHomePage = lazyNamed(() => import('../../pages/student/StudentHomePage'), 'StudentHomePage');
const CatalogPage = lazyNamed(() => import('../../pages/student/CatalogPage'), 'CatalogPage');
const ItemDetailsPage = lazyNamed(() => import('../../pages/student/ItemDetailsPage'), 'ItemDetailsPage');
const MyReservationsPage = lazyNamed(() => import('../../pages/student/MyReservationsPage'), 'MyReservationsPage');
const MyBorrowingsPage = lazyNamed(() => import('../../pages/student/MyBorrowingsPage'), 'MyBorrowingsPage');
const StudentProfilePage = lazyNamed(() => import('../../pages/student/StudentProfilePage'), 'StudentProfilePage');
const LibraryAssistantPage = AI_ASSISTANT_ENABLED
  ? lazyNamed(() => import('../../pages/shared/LibraryAssistantPage'), 'LibraryAssistantPage') : null;
const BorrowPage = lazyNamed(() => import('../../pages/librarian/BorrowPage'), 'BorrowPage');
const ReturnPage = lazyNamed(() => import('../../pages/librarian/ReturnPage'), 'ReturnPage');
const ReservationsOperationsPage = lazyNamed(() => import('../../pages/librarian/ReservationsOperationsPage'), 'ReservationsOperationsPage');
const VisitsPage = lazyNamed(() => import('../../pages/librarian/VisitsPage'), 'VisitsPage');
const CatalogAdminPage = lazyNamed(() => import('../../pages/librarian/CatalogAdminPage'), 'CatalogAdminPage');
const StudentsAdminPage = lazyNamed(() => import('../../pages/librarian/StudentsAdminPage'), 'StudentsAdminPage');
const AnalyticsDashboardPage = lazyNamed(() => import('../../pages/shared/AnalyticsDashboardPage'), 'AnalyticsDashboardPage');
const RoleHomePage = lazyNamed(() => import('../../pages/shared/RoleHomePage'), 'RoleHomePage');
const ManagementBorrowingsPage = lazyNamed(() => import('../../pages/management/ManagementBorrowingsPage'), 'ManagementBorrowingsPage');
const ManagementVisitsPage = lazyNamed(() => import('../../pages/management/ManagementVisitsPage'), 'ManagementVisitsPage');
const ForbiddenPage = lazyNamed(() => import('../../pages/system/ForbiddenPage'), 'ForbiddenPage');
const NotFoundPage = lazyNamed(() => import('../../pages/system/NotFoundPage'), 'NotFoundPage');

function assistantPage(workspace) {
  if (!AI_ASSISTANT_ENABLED) return <Navigate to={workspace} replace />;
  const student = workspace === '/student';
  return <LibraryAssistantPage
    itemDetailsBase={student ? '/student/items' : `${workspace}/ai/items`}
    catalogueTo={student ? '/student/catalog' : undefined}
  />;
}

function staffAssistantDetails(workspace) {
  return AI_ASSISTANT_ENABLED
    ? <ItemDetailsPage backTo={`${workspace}/ai`} backLabel="ai.backToAssistant" canReserve={false} />
    : <Navigate to={workspace} replace />;
}

function RouteFallback() {
  return (
    <div className="route-loading" role="status" aria-label="Loading page">
      <span className="catalog-spinner" aria-hidden="true" />
    </div>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />

          <Route element={<RequireAuth />}>
            <Route path="/forbidden" element={<ForbiddenPage />} />

            <Route element={<RequireRole roles={['STUDENT']} />}>
              <Route path="/student" element={<StudentShell />}>
                <Route index element={<StudentHomePage />} />
                <Route path="catalog" element={<CatalogPage />} />
                <Route path="items/:itemId" element={<ItemDetailsPage />} />
                <Route path="reservations" element={<MyReservationsPage />} />
                <Route path="borrowings" element={<MyBorrowingsPage />} />
                <Route path="profile" element={<StudentProfilePage />} />
                <Route path="ai" element={assistantPage('/student')} />
              </Route>
            </Route>

            <Route element={<RequireRole roles={['LIBRARIAN']} />}>
              <Route path="/librarian" element={<StaffShell mode="librarian" />}>
                <Route index element={<RoleHomePage role="LIBRARIAN" />} />
                <Route path="borrow" element={<BorrowPage />} />
                <Route path="return" element={<ReturnPage />} />
                <Route path="reservations" element={<ReservationsOperationsPage />} />
                <Route path="visits" element={<VisitsPage />} />
                <Route path="catalog" element={<CatalogAdminPage />} />
                <Route path="students" element={<StudentsAdminPage />} />
                <Route path="analytics" element={<AnalyticsDashboardPage />} />
                <Route path="ai" element={assistantPage('/librarian')} />
                <Route path="ai/items/:itemId" element={staffAssistantDetails('/librarian')} />
              </Route>
            </Route>

            <Route element={<RequireRole roles={['MANAGEMENT']} />}>
              <Route path="/management" element={<StaffShell mode="management" />}>
                <Route index element={<AnalyticsDashboardPage management />} />
                <Route path="analytics" element={<AnalyticsDashboardPage management />} />
                <Route path="borrowings" element={<ManagementBorrowingsPage />} />
                <Route path="visits" element={<ManagementVisitsPage />} />
                <Route path="ai" element={assistantPage('/management')} />
                <Route path="ai/items/:itemId" element={staffAssistantDetails('/management')} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
