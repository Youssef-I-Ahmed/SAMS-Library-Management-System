export const arStaff = {
  staff: {
    common: {
      search: 'بحث',
      searching: 'جارٍ البحث...',
      loading: 'جارٍ التحميل...',
      cancel: 'إلغاء',
      all: 'الكل',
      status: 'الحالة',
      branch: 'الفرع',
      allBranches: 'كل الفروع',
      studentNumber: 'رقم الطالب',
      copy: 'النسخة',
      shelf: 'الرف',
      minutes: 'دقيقة',
      hours: 'ساعة',
      operationFailed: 'تعذر إتمام العملية'
    },

    borrow: {
      eyebrow: 'مكتب الإعارة',
      title: 'استعارة مادة',
      subtitle:
        'سلّم حجزًا نشطًا أو أنشئ استعارة مباشرة لنسخة متاحة لطالب مؤهل.',
      fromReservation: 'من حجز',
      direct: 'استعارة مباشرة',
      validReservations: 'الحجوزات النشطة الصالحة',
      ready: 'جاهز للاستلام',
      searchReservation:
        'رقم الطالب أو الاسم أو البريد أو عنوان المادة أو رقم الكتاب...',
      noReservations: 'لا توجد حجوزات صالحة',
      noReservationsBody:
        'جرّب بحثًا آخر أو استخدم الاستعارة المباشرة.',
      notes: 'ملاحظات داخلية',
      notesPlaceholder: 'ملاحظة اختيارية على عملية الإعارة...',
      checkout: 'تسليم النسخة',
      checkingOut: 'جارٍ التسليم...',
      success: 'تم إنشاء الاستعارة بنجاح',
      step1: 'الخطوة 1',
      step2: 'الخطوة 2',
      studentAndCopy: 'الطالب والنسخة الفعلية',
      copySearch: 'البحث عن نسخة متاحة',
      copySearchPlaceholder:
        'Barcode أو كود النسخة أو الرف أو عنوان المادة...',
      findCopy: 'بحث عن النسخ المتاحة',
      confirmDirect: 'تأكيد الاستعارة المباشرة',
      selectCopyHint:
        'ابحث عن نسخة متاحة وحددها أولًا.'
    },

    return: {
      eyebrow: 'مكتب الإعارة',
      title: 'إرجاع مادة',
      subtitle:
        'ابحث عن استعارة نشطة وسجل حالة الإرجاع وحدّث حالة النسخة الفعلية.',
      searchPlaceholder:
        'رقم الطالب أو الاسم أو Barcode أو كود النسخة أو العنوان...',
      noActive: 'لا توجد استعارات نشطة',
      noActiveBody: 'جرّب بحثًا آخر.',
      due: 'موعد الإرجاع',
      process: 'تسجيل الإرجاع',
      confirmEyebrow: 'حالة الإرجاع',
      confirmTitle: 'إتمام عملية الإرجاع',
      notes: 'ملاحظات الإرجاع',
      confirm: 'إتمام الإرجاع',
      returning: 'جارٍ الإرجاع...',
      success: 'تم إتمام الإرجاع بنجاح'
    },

    reservations: {
      eyebrow: 'مكتب الإعارة',
      title: 'قائمة الحجوزات',
      subtitle:
        'راجع الحجوزات وحدد المنتهي منها وسلّم الحجوزات الصالحة أو ألغِ الحجز.',
      searchPlaceholder:
        'رقم الطالب أو الاسم أو البريد أو عنوان المادة أو رقم الكتاب...',
      holdState: 'حالة مدة الحجز',
      valid: 'صالح',
      overdue: 'منتهي المدة',
      records: 'حجز',
      empty: 'لا توجد حجوزات مطابقة للفلاتر.',
      reserved: 'تم الحجز',
      expires: 'ينتهي',
      checkout: 'تسليم',
      cancel: 'إلغاء',
      cancelling: 'جارٍ الإلغاء...',
      checkoutSuccess: 'تم تسليم الحجز بنجاح',
      cancelSuccess: 'تم إلغاء الحجز بنجاح'
    },

    visits: {
      eyebrow: 'دخول المكتبة',
      title: 'زيارات المكتبة',
      subtitle:
        'سجل دخول الطالب الفعلي للمكتبة وأغلق الزيارة عند مغادرته.',
      newVisit: 'زيارة جديدة',
      checkIn: 'تسجيل دخول الطالب',
      checkingIn: 'جارٍ تسجيل الدخول...',
      checkInSuccess: 'تم تسجيل دخول الطالب',
      queue: 'قائمة الزيارات',
      currentVisitors: 'الزيارات المفتوحة والسجل',
      source: 'المصدر',
      searchPlaceholder: 'رقم الطالب أو الاسم أو البريد أو الفرع...',
      openOnly: 'الزيارات المفتوحة فقط',
      empty: 'لا توجد زيارات مطابقة للفلاتر.',
      checkedIn: 'وقت الدخول',
      duration: 'المدة',
      open: 'داخل المكتبة',
      closed: 'مغلقة',
      checkOut: 'تسجيل الخروج',
      checkingOut: 'جارٍ تسجيل الخروج...',
      checkOutSuccess: 'تم تسجيل خروج الطالب'
    },

    reservationStatus: {
      PENDING: 'قيد الانتظار',
      ACTIVE: 'نشط',
      FULFILLED: 'تم الاستلام',
      CANCELLED: 'ملغي',
      EXPIRED: 'منتهي'
    },

    borrowingStatus: {
      ACTIVE: 'نشطة',
      RETURNED: 'تم الإرجاع',
      LOST: 'مفقودة',
      OVERDUE: 'متأخرة'
    },

    returnOutcome: {
      GOOD: 'جيدة',
      FAIR: 'مقبولة',
      DAMAGED: 'تالفة',
      LOST: 'مفقودة'
    },

    returnOutcomeHelp: {
      GOOD: 'إعادة النسخة إلى متاحة بحالة جيدة.',
      FAIR: 'إعادة النسخة إلى متاحة بحالة مقبولة.',
      DAMAGED: 'تسجيل النسخة تالفة وغير متاحة.',
      LOST: 'تسجيل الاستعارة والنسخة كمفقودة.'
    },

    visitSource: {
      MANUAL: 'يدوي',
      BARCODE: 'Barcode',
      QR: 'QR'
    }
  }
};
