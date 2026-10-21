export const en = {
  meta: { title: 'SAMS Library System' },

  common: {
    academy: 'Sadat Academy for Management Sciences',
    library: 'Library',
    light: 'Light',
    dark: 'Dark',
    english: 'English',
    arabic: 'العربية',
    theme: 'Theme',
    language: 'Language',
    switchToLight: 'Switch to light theme',
    switchToDark: 'Switch to dark theme',
    switchToEnglish: 'Switch to English',
    switchToArabic: 'Switch to Arabic'
  },

  roles: {
    STUDENT: 'Student',
    LIBRARIAN: 'Librarian',
    MANAGEMENT: 'Management'
  },

  nav: {
    home: 'Home',
    studentNavigation: 'Student navigation',
    catalog: 'Catalog',
    myReservations: 'My Reservations',
    myBorrowings: 'My Borrowings',
    dashboard: 'Dashboard',
    borrow: 'Borrow Item',
    return: 'Return Item',
    reservations: 'Reservations',
    visits: 'Library Visits',
    overview: 'Overview',
    analytics: 'Analytics',
    borrowings: 'Borrowings'
  },

  shell: {
    librarianWorkspace: 'Library Operations',
    managementWorkspace: 'Management Workspace'
  },

  auth: {
    portalEyebrow: 'University Library',
    heroTitle: 'Find. Reserve. Learn.',
    heroBody:
      'A single SAMS Library experience for students, librarians and university management.',
    welcome: 'Welcome to SAMS Library',
    devIntro:
      'Choose a development identity to enter the correct role workspace.',
    continue: 'Continue',
    signingIn: 'Signing in...',
    signOut: 'Sign out',
    loginFailed: 'Could not sign in',
    devOnly:
      'Development authentication only. University SSO will replace this entry step before production.',
    restoringSession: 'Restoring your SAMS session...',
    signedInAs: 'Signed in as',
    email: 'University email',
    studentId: 'Student ID'
  },

  roleHome: {
    studentTitle: 'Your library starts here.',
    studentBody:
      'The student workspace is ready for catalog discovery, availability, reservations and borrowing history.',
    librarianTitle: 'Library operations, one workspace.',
    librarianBody:
      'The librarian shell is ready for circulation, reservations, visits and catalog operations.',
    managementTitle: 'Read-only visibility for management.',
    managementBody:
      'The management shell is ready for KPIs, trends and operational insight without mutation actions.',
    nextTitle: 'Next module',
    nextBody:
      'This destination is already protected by the correct role and will be implemented in the next frontend checkpoints.'
  },

  placeholder: {
    body:
      'This protected route is already part of the final navigation. Its full workflow will be connected to the stable backend API in the scheduled Sprint 9 checkpoint.'
  },

  system: {
    forbiddenTitle: 'You do not have access to this area.',
    forbiddenBody:
      'SAMS uses your assigned university role to protect student, librarian and management workflows.',
    backToWorkspace: 'Back to my workspace',
    notFoundTitle: 'Page not found.',
    notFoundBody:
      'The page you requested does not exist in the SAMS Library application.',
    backHome: 'Go to SAMS'
  }
};
