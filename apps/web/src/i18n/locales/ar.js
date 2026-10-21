export const ar = {
  meta: { title: 'نظام مكتبة أكاديمية السادات' },

  common: {
    academy: 'أكاديمية السادات للعلوم الإدارية',
    library: 'المكتبة',
    light: 'فاتح',
    dark: 'داكن',
    english: 'English',
    arabic: 'العربية',
    theme: 'المظهر',
    language: 'اللغة',
    switchToLight: 'التبديل إلى المظهر الفاتح',
    switchToDark: 'التبديل إلى المظهر الداكن',
    switchToEnglish: 'التبديل إلى اللغة الإنجليزية',
    switchToArabic: 'التبديل إلى اللغة العربية'
  },

  roles: {
    STUDENT: 'طالب',
    LIBRARIAN: 'أمين مكتبة',
    MANAGEMENT: 'الإدارة'
  },

  nav: {
    home: 'الرئيسية',
    studentNavigation: 'تنقل الطالب',
    catalog: 'الفهرس',
    myReservations: 'حجوزاتي',
    myBorrowings: 'استعاراتي',
    dashboard: 'لوحة التحكم',
    borrow: 'استعارة مادة',
    return: 'إرجاع مادة',
    reservations: 'الحجوزات',
    visits: 'زيارات المكتبة',
    overview: 'نظرة عامة',
    analytics: 'التحليلات',
    borrowings: 'الاستعارات'
  },

  shell: {
    librarianWorkspace: 'عمليات المكتبة',
    managementWorkspace: 'مساحة الإدارة'
  },

  auth: {
    portalEyebrow: 'مكتبة الأكاديمية',
    heroTitle: 'ابحث. احجز. تعلّم.',
    heroBody:
      'تجربة موحدة لمكتبة أكاديمية السادات للطلاب وأمناء المكتبة والإدارة.',
    welcome: 'مرحبًا بك في مكتبة الأكاديمية',
    devIntro:
      'اختر هوية التطوير للدخول إلى مساحة العمل المناسبة للصلاحية.',
    continue: 'دخول',
    signingIn: 'جارٍ تسجيل الدخول...',
    signOut: 'تسجيل الخروج',
    loginFailed: 'تعذر تسجيل الدخول',
    devOnly:
      'تسجيل الدخول الحالي مخصص للتطوير فقط، وسيتم استبداله بتسجيل دخول الجامعة قبل الإنتاج.',
    restoringSession: 'جارٍ استعادة جلسة SAMS...',
    signedInAs: 'تم تسجيل الدخول باسم',
    email: 'البريد الجامعي',
    studentId: 'رقم الطالب'
  },

  roleHome: {
    studentTitle: 'مكتبتك تبدأ من هنا.',
    studentBody:
      'مساحة الطالب جاهزة للبحث في الفهرس ومعرفة التوفر والحجز ومتابعة سجل الاستعارة.',
    librarianTitle: 'كل عمليات المكتبة في مساحة واحدة.',
    librarianBody:
      'واجهة أمين المكتبة جاهزة للاستعارة والإرجاع والحجوزات والزيارات وإدارة الفهرس.',
    managementTitle: 'رؤية واضحة للإدارة بدون صلاحيات تعديل.',
    managementBody:
      'واجهة الإدارة جاهزة للمؤشرات والاتجاهات والرؤية التشغيلية مع الحفاظ على الصلاحيات.',
    nextTitle: 'الوحدة التالية',
    nextBody:
      'المسار محمي بالفعل بالصلاحية الصحيحة وسيتم ربطه بالـAPI المستقر في مراحل Sprint 9 القادمة.'
  },

  placeholder: {
    body:
      'هذا المسار المحمي جزء من التنقل النهائي بالفعل، وسيتم تنفيذ كامل الـworkflow وربطه بالـBackend في المرحلة المحددة من Sprint 9.'
  },

  system: {
    forbiddenTitle: 'ليس لديك صلاحية للوصول إلى هذه المنطقة.',
    forbiddenBody:
      'يعتمد SAMS على صلاحية المستخدم الجامعية لحماية مساحات الطالب وأمين المكتبة والإدارة.',
    backToWorkspace: 'العودة إلى مساحة عملي',
    notFoundTitle: 'الصفحة غير موجودة.',
    notFoundBody:
      'الصفحة المطلوبة غير موجودة في نظام مكتبة أكاديمية السادات.',
    backHome: 'العودة إلى SAMS'
  }
};
