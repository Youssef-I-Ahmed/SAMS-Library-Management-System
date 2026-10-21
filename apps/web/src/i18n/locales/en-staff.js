export const enStaff = {
  staff: {
    common: {
      search: 'Search',
      searching: 'Searching...',
      loading: 'Loading...',
      cancel: 'Cancel',
      all: 'All',
      status: 'Status',
      branch: 'Branch',
      allBranches: 'All branches',
      studentNumber: 'Student ID',
      copy: 'Copy',
      shelf: 'Shelf',
      minutes: 'min',
      hours: 'hr',
      operationFailed: 'Operation could not be completed'
    },

    borrow: {
      eyebrow: 'Circulation desk',
      title: 'Borrow Item',
      subtitle:
        'Checkout an active reservation or issue an available copy directly to an eligible student.',
      fromReservation: 'From reservation',
      direct: 'Direct checkout',
      validReservations: 'Valid active reservations',
      ready: 'ready for checkout',
      searchReservation:
        'Student ID, name, email, item title or call number...',
      noReservations: 'No valid reservations found',
      noReservationsBody:
        'Try another search or use Direct checkout.',
      notes: 'Internal notes',
      notesPlaceholder: 'Optional circulation note...',
      checkout: 'Checkout',
      checkingOut: 'Checking out...',
      success: 'Borrowing created successfully',
      step1: 'Step 1',
      step2: 'Step 2',
      studentAndCopy: 'Student and physical copy',
      copySearch: 'Find available copy',
      copySearchPlaceholder:
        'Scan/search barcode, copy code, shelf or title...',
      findCopy: 'Find available copies',
      confirmDirect: 'Confirm direct checkout',
      selectCopyHint:
        'Search and select an available copy first.'
    },

    return: {
      eyebrow: 'Circulation desk',
      title: 'Return Item',
      subtitle:
        'Find an active borrowing, record the return outcome and reconcile the physical copy.',
      searchPlaceholder:
        'Student ID, name, barcode, copy code, title or call number...',
      noActive: 'No active borrowings found',
      noActiveBody: 'Try another search.',
      due: 'Due',
      process: 'Process return',
      confirmEyebrow: 'Return outcome',
      confirmTitle: 'Complete this return',
      notes: 'Return notes',
      confirm: 'Complete return',
      returning: 'Returning...',
      success: 'Return completed successfully'
    },

    reservations: {
      eyebrow: 'Circulation desk',
      title: 'Reservation Queue',
      subtitle:
        'Review holds, identify overdue reservations, checkout valid holds or cancel reservations.',
      searchPlaceholder:
        'Student ID, name, email, item title or call number...',
      holdState: 'Hold state',
      valid: 'Valid',
      overdue: 'Overdue',
      records: 'reservations',
      empty: 'No reservations match these filters.',
      reserved: 'Reserved',
      expires: 'Expires',
      checkout: 'Checkout',
      cancel: 'Cancel',
      cancelling: 'Cancelling...',
      checkoutSuccess: 'Reservation checked out successfully',
      cancelSuccess: 'Reservation cancelled successfully'
    },

    visits: {
      eyebrow: 'Library access',
      title: 'Library Visits',
      subtitle:
        'Register physical library entry and close open visits when students leave.',
      newVisit: 'New visit',
      checkIn: 'Check in student',
      checkingIn: 'Checking in...',
      checkInSuccess: 'Student checked in',
      queue: 'Visit queue',
      currentVisitors: 'Open visits and history',
      source: 'Source',
      searchPlaceholder: 'Student ID, name, email or branch...',
      openOnly: 'Open visits only',
      empty: 'No visits match these filters.',
      checkedIn: 'Checked in',
      duration: 'Duration',
      open: 'Open',
      closed: 'Closed',
      checkOut: 'Check out',
      checkingOut: 'Checking out...',
      checkOutSuccess: 'Student checked out'
    },

    reservationStatus: {
      PENDING: 'Pending',
      ACTIVE: 'Active',
      FULFILLED: 'Fulfilled',
      CANCELLED: 'Cancelled',
      EXPIRED: 'Expired'
    },

    borrowingStatus: {
      ACTIVE: 'Active',
      RETURNED: 'Returned',
      LOST: 'Lost',
      OVERDUE: 'Overdue'
    },

    returnOutcome: {
      GOOD: 'Good',
      FAIR: 'Fair',
      DAMAGED: 'Damaged',
      LOST: 'Lost'
    },

    returnOutcomeHelp: {
      GOOD: 'Return copy to AVAILABLE in good condition.',
      FAIR: 'Return copy to AVAILABLE in fair condition.',
      DAMAGED: 'Mark copy DAMAGED and unavailable.',
      LOST: 'Mark borrowing and copy as LOST.'
    },

    visitSource: {
      MANUAL: 'Manual',
      BARCODE: 'Barcode',
      QR: 'QR'
    }
  }
};
