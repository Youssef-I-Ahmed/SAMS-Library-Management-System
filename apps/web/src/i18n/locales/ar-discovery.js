export const arDiscovery = {
  itemTypes: {
    BOOK: 'كتاب',
    ACADEMIC_WORK: 'مشروعات تخرج ورسائل علمية',
    THESIS: 'رسالة علمية',
    PROJECT: 'مشروع تخرج'
  },

  languages: {
    english: 'الإنجليزية',
    arabic: 'العربية'
  },

  contributorRoles: {
    AUTHOR: 'مؤلف',
    EDITOR: 'محرر',
    SUPERVISOR: 'مشرف',
    RESEARCHER: 'باحث',
    PROJECT_MEMBER: 'عضو مشروع',
    PROJECT_SUPERVISOR: 'مشرف المشروع'
  },

  studentHome: {
    titleLead: 'معرفة اليوم،',
    titleLine: 'لمستقبل',
    titleAccent: 'أكثر إشراقًا.',
    imageCaption: 'تصوّر توضيحي للحرم الجامعي',
    browseAll: 'استكشف الفهرس',
    collectionNavigation: 'تصفح المجموعات',
    explore: 'استكشف المجموعة',
    collectionTitles: { BOOK: 'الكتب والمراجع', ACADEMIC_WORK: 'مشروعات تخرج ورسائل علمية', THESIS: 'الرسائل والأبحاث', PROJECT: 'مشروعات التخرج' },
    experienceEyebrow: 'تجربتك مع المكتبة',
    experienceTitle: 'كل فكرة تبدأ بالاكتشاف.',
    steps: {
      discover: { title: 'اكتشف', body: 'ابحث في الفهرس بالعنوان أو المؤلف أو الموضوع.' },
      reserve: { title: 'احجز', body: 'تابع حجوزاتك وراجع التوفر المسجل في النظام.' },
      learn: { title: 'واصل التعلم', body: 'تابع استعاراتك ومواعيد إرجاعها.' }
    },
    footerLine: 'بالمعرفة نبني مستقبلًا أفضل.',
    eyebrow: 'استكشاف المكتبة',
    greeting: 'مرحبًا',
    subtitle:
      'ابحث في الكتب والرسائل العلمية ومشروعات التخرج داخل مكتبة أكاديمية السادات.',
    searchPlaceholder:
      'ابحث بالعنوان أو المؤلف أو ISBN أو ديوي أو رقم الكتاب...',
    searchLabel: 'البحث في فهرس المكتبة',
    search: 'بحث',
    searchHint:
      'يمكنك البحث بالعنوان أو المساهم أو ISBN أو الناشر أو تصنيف ديوي أو رقم الكتاب.',
    browseEyebrow: 'المجموعات',
    browseTitle: 'اكتشف آفاقًا جديدة.',
    collection: {
      BOOK: 'الكتب المنشورة والمراجع.',
      ACADEMIC_WORK: 'مشروعات التخرج والرسائل العلمية المعتمدة في الأكاديمية.',
      THESIS: 'الرسائل العلمية والأعمال البحثية.',
      PROJECT: 'مشروعات التخرج من أقسام الأكاديمية.'
    }
  },

  discovery: {
    catalog: {
      eyebrow: 'فهرس المكتبة',
      title: 'استكشف المجموعة',
      subtitle:
        'ابحث في فهرس المكتبة وراجع التوفر المسجل في الفروع.',
      searchPlaceholder:
        'العنوان، المساهم، ISBN، رقم الكتاب، تصنيف ديوي...',
      searchLabel: 'البحث في الفهرس',
      search: 'بحث',
      loading: 'جارٍ تحميل الفهرس...',
      loaded: 'اكتمل تحميل الفهرس.',
      results: 'نتيجة',
      for: 'للبحث',
      sort: 'الترتيب',
      headerNote: 'مساحة للمعرفة. ومجموعة تستحق الاستكشاف.',
      allResources: 'جميع المصادر',
      resultsHeading: 'نتائج الفهرس',
      view: 'طريقة عرض النتائج',
      grid: 'عرض شبكي',
      list: 'عرض قائمة',
      retry: 'حاول مجددًا'
    },

    filters: {
      eyebrow: 'تصفية',
      title: 'الفلاتر',
      clear: 'مسح الفلاتر',
      show: 'إظهار الفلاتر',
      hide: 'إخفاء الفلاتر',
      all: 'الكل',
      type: 'نوع المادة',
      category: 'الفئة',
      dewey: 'تصنيف ديوي',
      language: 'اللغة',
      year: 'سنة النشر',
      branch: 'الفرع',
      availableOnly: 'مسجل كمتاح',
      availableOnlyHint:
        'اعرض المواد التي لها نسخة مسجلة كمتاحة، بما فيها أي نسخ تجريبية.'
    },

    sort: {
      TITLE_ASC: 'العنوان أ-ي',
      TITLE_DESC: 'العنوان ي-أ',
      YEAR_DESC: 'سنة النشر: الأحدث',
      YEAR_ASC: 'سنة النشر: الأقدم',
      NEWEST: 'المضاف حديثًا'
    },

    card: {
      noCover: 'الغلاف غير متوفر',
      noContributor: 'المساهم غير مسجل',
      year: 'السنة',
      language: 'اللغة',
      dewey: 'ديوي',
      callNumber: 'رقم الكتاب',
      branches: 'فروع مسجلة',
      details: 'عرض التفاصيل'
    },

    availability: {
      available: 'متاح بالسجلات',
      unavailable: 'غير متاح بالسجلات',
      noCopies: 'لا توجد نسخ مسجلة'
    },

    inventoryNotice: {
      title: 'تأكد من التوفر الفعلي',
      body:
        'قد يشمل التوفر المسجل في النظام نسخًا تجريبية ولا يؤكد وجود مخزون فعلي. تواصل مع المكتبة لتأكيد التوفر قبل الزيارة، حتى إذا كان لديك حجز.'
    },

    empty: {
      title: 'لا توجد مواد مطابقة',
      body:
        'جرّب كلمة بحث مختلفة أو امسح فلترًا أو أكثر.'
    },

    pagination: {
      label: 'صفحات الفهرس',
      previous: 'السابق',
      next: 'التالي',
      page: 'صفحة',
      of: 'من'
    },

    detail: {
      sections: 'أقسام المادة',
      loaded: 'اكتمل تحميل تفاصيل المادة.',
      missingTitle: 'المادة غير موجودة',
      missingBody: 'هذا السجل غير متاح. عد إلى الفهرس لاستكشاف مواد أخرى.',
      requestId: 'معرّف الطلب',
      refreshError: 'تعذر تحديث بيانات التوفر المسجلة',
      loading: 'جارٍ تحميل تفاصيل المادة...',
      back: 'العودة للفهرس',
      metadataEyebrow: 'البيانات الببليوجرافية',
      metadataTitle: 'بيانات المادة',
      descriptionEyebrow: 'عن المادة',
      descriptionTitle: 'الوصف / الملخص',
      availabilityEyebrow: 'التوفر المسجل',
      availabilityTitle: 'السجلات حسب الفرع',
      availableCopies: 'نسخ مسجلة كمتاحة',
      totalCopies: 'نسخ مسجلة',
      noBranchCopies:
        'لا يوجد فرع نشط لديه نسخة مسجلة حاليًا.',
      reserveReady: 'متاح للحجز',
      reserveReadyHint:
        'يوجد فرع واحد على الأقل به نسخة متاحة حاليًا.',
      reserveUnavailable: 'لا توجد نسخة متاحة للحجز',
      reserveUnavailableHint:
        'يمكنك مراجعة البيانات والمحاولة مرة أخرى لاحقًا.',
      type: 'نوع المادة',
      year: 'سنة النشر',
      language: 'اللغة',
      callNumber: 'رقم الكتاب',
      dewey: 'تصنيف ديوي',
      category: 'الفئة',
      isbn: 'ISBN',
      publisher: 'الناشر',
      edition: 'الطبعة',
      academicYear: 'العام الأكاديمي',
      legacyCode: 'الكود التاريخي',
      subjects: 'التخصصات والموضوعات',
      extent: 'الوصف المادي',
      dimensions: 'الأبعاد',
      recordType: 'نوع الوعاء',
      faculty: 'الكلية',
      department: 'القسم'
    },

    errors: {
      facetsTitle: 'تعذر تحميل الفلاتر',
      searchTitle: 'فشل البحث في الفهرس',
      detailTitle: 'تعذر تحميل تفاصيل المادة'
    }
  }
};
