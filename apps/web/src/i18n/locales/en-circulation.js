export const enCirculation = {
  reservations: {
    page: {
      eyebrow: 'Student circulation',
      title: 'My Reservations',
      subtitle:
        'Track active holds, pickup branches and reservation history.',
      statusFilter: 'Status',
      total: 'reservations',
      loading: 'Loading reservations...',
      emptyTitle: 'No reservations found',
      emptyBody:
        'Reserve an available library item from its details page.'
    },

    status: {
      ALL: 'All statuses',
      PENDING: 'Pending',
      ACTIVE: 'Active',
      FULFILLED: 'Fulfilled',
      CANCELLED: 'Cancelled',
      EXPIRED: 'Expired'
    },

    fields: {
      branch: 'Pickup branch',
      reservedAt: 'Reserved at',
      expiresAt: 'Hold expires',
      callNumber: 'Call number'
    },

    detail: {
      checking: 'Checking your reservation status...',
      eyebrow: 'Reservation',
      title: 'Reserve an available copy',
      body:
        'Choose a pickup branch. The library will hold one available copy for the reservation period.',
      start: 'Reserve this item',
      pickupBranch: 'Pickup branch',
      available: 'available',
      confirm: 'Confirm reservation',
      reserving: 'Reserving...',
      keepBrowsing: 'Not now',
      currentEyebrow: 'Your hold',
      alreadyReserved: 'You already have an active reservation for this item.',
      successTitle: 'Reservation confirmed.',
      holdUntil: 'Hold valid until',
      viewReservations: 'View my reservations',
      unavailableTitle: 'No copy available to reserve',
      unavailableBody:
        'There is no available physical copy at an active branch right now.'
    },

    cancel: {
      action: 'Cancel reservation',
      confirmText:
        'Cancel this reservation and release the held copy?',
      confirm: 'Yes, cancel',
      cancelling: 'Cancelling...',
      keep: 'Keep reservation'
    },

    errors: {
      title: 'Reservation could not be completed',
      activeExists:
        'You already have an active reservation for this item.',
      limitReached:
        'You have reached the maximum number of active reservations.',
      noAvailableCopy:
        'The selected branch no longer has an available copy.',
      notEligible:
        'Your academic status is not eligible for reservations.',
      accountInactive:
        'Your student account is inactive.',
      noPolicy:
        'Reservations are not configured for this item and branch.',
      itemUnavailable:
        'This library item is no longer available.',
      branchUnavailable:
        'The selected branch is no longer available.',
      default:
        'The reservation could not be completed. Please try again.'
    }
  },

  borrowings: {
    page: {
      eyebrow: 'Student circulation',
      title: 'My Borrowings',
      subtitle:
        'Review active loans, due dates, overdue items and borrowing history.',
      statusFilter: 'Status',
      total: 'borrowings',
      loading: 'Loading borrowings...',
      emptyTitle: 'No borrowings found',
      emptyBody:
        'Your active and historical library loans will appear here.'
    },

    status: {
      ALL: 'All statuses',
      ACTIVE: 'Active',
      RETURNED: 'Returned',
      LOST: 'Lost',
      OVERDUE: 'Overdue'
    },

    fields: {
      branch: 'Branch',
      borrowedAt: 'Borrowed at',
      dueAt: 'Due at',
      returnedAt: 'Returned at',
      callNumber: 'Call number',
      returnCondition: 'Return condition'
    },

    conditions: {
      GOOD: 'Good',
      FAIR: 'Fair',
      DAMAGED: 'Damaged',
      LOST: 'Lost'
    },

    overdue: {
      title: 'This borrowing is overdue.',
      days: 'day(s) overdue'
    },

    errors: {
      title: 'Borrowings could not be loaded'
    }
  },

  profile: {
    menu: 'My profile',
    eyebrow: 'Student account',
    title: 'My Profile',
    subtitle:
      'Your university identity and academic information used by SAMS Library.',
    fields: {
      name: 'Name',
      email: 'University email',
      studentId: 'Student ID',
      academicStatus: 'Academic status',
      faculty: 'Faculty',
      department: 'Department'
    },
    academicStatus: {
      ACTIVE: 'Active',
      GRADUATED: 'Graduated',
      SUSPENDED: 'Suspended',
      INACTIVE: 'Inactive'
    }
  }
};
