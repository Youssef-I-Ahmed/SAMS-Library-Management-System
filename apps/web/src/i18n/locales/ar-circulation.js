export const arCirculation = {
  reservations: {
    page: {
      eyebrow: 'خدمات الطالب',
      title: 'حجوزاتي',
      subtitle:
        'تابع الحجوزات النشطة وفرع الاستلام وسجل الحجوزات.',
      statusFilter: 'الحالة',
      total: 'حجز',
      loading: 'جارٍ تحميل الحجوزات...',
      emptyTitle: 'لا توجد حجوزات',
      emptyBody:
        'يمكنك حجز مادة متاحة من صفحة تفاصيلها.'
    },

    status: {
      ALL: 'كل الحالات',
      PENDING: 'قيد الانتظار',
      ACTIVE: 'نشط',
      FULFILLED: 'تم الاستلام',
      CANCELLED: 'ملغي',
      EXPIRED: 'منتهي'
    },

    fields: {
      branch: 'فرع الاستلام',
      reservedAt: 'وقت الحجز',
      expiresAt: 'انتهاء مدة الحجز',
      callNumber: 'رقم الكتاب'
    },

    detail: {
      checking: 'جارٍ التحقق من حالة حجزك...',
      eyebrow: 'الحجز',
      title: 'احجز نسخة متاحة',
      body:
        'اختر فرع الاستلام وسيتم الاحتفاظ بنسخة متاحة خلال مدة الحجز.',
      start: 'احجز هذه المادة',
      pickupBranch: 'فرع الاستلام',
      available: 'متاح',
      confirm: 'تأكيد الحجز',
      reserving: 'جارٍ الحجز...',
      keepBrowsing: 'ليس الآن',
      currentEyebrow: 'حجزك الحالي',
      alreadyReserved: 'لديك حجز نشط بالفعل لهذه المادة.',
      successTitle: 'تم تأكيد الحجز.',
      holdUntil: 'الحجز صالح حتى',
      viewReservations: 'عرض حجوزاتي',
      unavailableTitle: 'لا توجد نسخة متاحة للحجز',
      unavailableBody:
        'لا توجد نسخة فعلية متاحة حاليًا في أحد الفروع النشطة.'
    },

    cancel: {
      action: 'إلغاء الحجز',
      confirmText:
        'هل تريد إلغاء الحجز وإتاحة النسخة المحجوزة مرة أخرى؟',
      confirm: 'نعم، إلغاء',
      cancelling: 'جارٍ الإلغاء...',
      keep: 'الاحتفاظ بالحجز'
    },

    errors: {
      title: 'تعذر إتمام الحجز',
      activeExists:
        'لديك حجز نشط بالفعل لهذه المادة.',
      limitReached:
        'وصلت إلى الحد الأقصى للحجوزات النشطة.',
      noAvailableCopy:
        'لم تعد هناك نسخة متاحة في الفرع المحدد.',
      notEligible:
        'حالتك الأكاديمية لا تسمح بإنشاء حجز.',
      accountInactive:
        'حساب الطالب غير نشط.',
      noPolicy:
        'الحجز غير مهيأ لهذه المادة وهذا الفرع.',
      itemUnavailable:
        'هذه المادة لم تعد متاحة.',
      branchUnavailable:
        'الفرع المحدد لم يعد متاحًا.',
      default:
        'تعذر إتمام الحجز. حاول مرة أخرى.'
    }
  },

  borrowings: {
    page: {
      eyebrow: 'خدمات الطالب',
      title: 'استعاراتي',
      subtitle:
        'راجع الاستعارات النشطة ومواعيد الإرجاع والمتأخرات والسجل السابق.',
      statusFilter: 'الحالة',
      total: 'استعارة',
      loading: 'جارٍ تحميل الاستعارات...',
      emptyTitle: 'لا توجد استعارات',
      emptyBody:
        'ستظهر هنا الاستعارات الحالية والسابقة.'
    },

    status: {
      ALL: 'كل الحالات',
      ACTIVE: 'نشطة',
      RETURNED: 'تم الإرجاع',
      LOST: 'مفقودة',
      OVERDUE: 'متأخرة'
    },

    fields: {
      branch: 'الفرع',
      borrowedAt: 'تاريخ الاستعارة',
      dueAt: 'موعد الإرجاع',
      returnedAt: 'تاريخ الإرجاع',
      callNumber: 'رقم الكتاب',
      returnCondition: 'حالة الإرجاع'
    },

    conditions: {
      GOOD: 'جيدة',
      FAIR: 'مقبولة',
      DAMAGED: 'تالفة',
      LOST: 'مفقودة'
    },

    overdue: {
      title: 'هذه الاستعارة متأخرة.',
      days: 'يوم تأخير'
    },

    errors: {
      title: 'تعذر تحميل الاستعارات'
    }
  },

  profile: {
    menu: 'ملفي الشخصي',
    eyebrow: 'حساب الطالب',
    title: 'ملفي الشخصي',
    subtitle:
      'بيانات هويتك الجامعية والمعلومات الأكاديمية المستخدمة داخل مكتبة SAMS.',
    fields: {
      name: 'الاسم',
      email: 'البريد الجامعي',
      studentId: 'رقم الطالب',
      academicStatus: 'الحالة الأكاديمية',
      faculty: 'الكلية',
      department: 'القسم'
    },
    academicStatus: {
      ACTIVE: 'نشط',
      GRADUATED: 'خريج',
      SUSPENDED: 'موقوف',
      INACTIVE: 'غير نشط'
    }
  }
};
