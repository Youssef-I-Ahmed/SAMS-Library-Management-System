export const arDiscovery = {
  itemTypes: {
    BOOK: 'كتاب',
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
    browseTitle: 'تصفح حسب نوع المادة',
    collection: {
      BOOK: 'الكتب المنشورة والمراجع.',
      THESIS: 'الرسائل العلمية والأعمال البحثية.',
      PROJECT: 'مشروعات التخرج من أقسام الأكاديمية.'
    }
  },

  discovery: {
    catalog: {
      eyebrow: 'فهرس المكتبة',
      title: 'استكشف المجموعة',
      subtitle:
        'ابحث داخل الفهرس النشط واعرف التوفر الآمن في الفروع.',
      searchPlaceholder:
        'العنوان، المساهم، ISBN، رقم الكتاب، تصنيف ديوي...',
      searchLabel: 'البحث في الفهرس',
      search: 'بحث',
      loading: 'جارٍ تحميل الفهرس...',
      results: 'نتيجة',
      for: 'للبحث',
      sort: 'الترتيب'
    },

    filters: {
      eyebrow: 'تصفية',
      title: 'الفلاتر',
      clear: 'مسح الفلاتر',
      all: 'الكل',
      type: 'نوع المادة',
      category: 'الفئة',
      dewey: 'تصنيف ديوي',
      language: 'اللغة',
      year: 'سنة النشر',
      branch: 'الفرع',
      availableOnly: 'متاح الآن فقط',
      availableOnlyHint:
        'اعرض المواد التي توجد منها نسخة فعلية متاحة حاليًا.'
    },

    sort: {
      TITLE_ASC: 'العنوان أ-ي',
      TITLE_DESC: 'العنوان ي-أ',
      YEAR_DESC: 'سنة النشر: الأحدث',
      YEAR_ASC: 'سنة النشر: الأقدم',
      NEWEST: 'المضاف حديثًا'
    },

    card: {
      year: 'السنة',
      language: 'اللغة',
      dewey: 'ديوي',
      callNumber: 'رقم الكتاب',
      branches: 'فروع',
      details: 'عرض التفاصيل'
    },

    availability: {
      available: 'متاح',
      unavailable: 'غير متاح حاليًا',
      noCopies: 'لا توجد نسخ مسجلة'
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
      loading: 'جارٍ تحميل تفاصيل المادة...',
      back: 'العودة للفهرس',
      metadataEyebrow: 'البيانات الببليوجرافية',
      metadataTitle: 'بيانات المادة',
      descriptionEyebrow: 'عن المادة',
      descriptionTitle: 'الوصف / الملخص',
      availabilityEyebrow: 'التوفر الحالي',
      availabilityTitle: 'التوفر حسب الفرع',
      availableCopies: 'نسخ متاحة',
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
