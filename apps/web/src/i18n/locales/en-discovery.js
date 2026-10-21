export const enDiscovery = {
  itemTypes: {
    BOOK: 'Book',
    THESIS: 'Thesis',
    PROJECT: 'Graduation Project'
  },

  languages: {
    english: 'English',
    arabic: 'Arabic'
  },

  contributorRoles: {
    AUTHOR: 'Author',
    EDITOR: 'Editor',
    SUPERVISOR: 'Supervisor',
    RESEARCHER: 'Researcher',
    PROJECT_MEMBER: 'Project member',
    PROJECT_SUPERVISOR: 'Project supervisor'
  },

  studentHome: {
    eyebrow: 'Student discovery',
    greeting: 'Welcome',
    subtitle:
      'Search books, theses and graduation projects across the SAMS Library collection.',
    searchPlaceholder:
      'Search by title, author, ISBN, Dewey, call number...',
    searchLabel: 'Search the library catalog',
    search: 'Search',
    searchHint:
      'Search by title, contributor, ISBN, publisher, Dewey classification or call number.',
    browseEyebrow: 'Collections',
    browseTitle: 'Browse by material type',
    collection: {
      BOOK: 'Published books and reference material.',
      THESIS: 'Academic theses and research work.',
      PROJECT: 'Graduation projects from SAMS departments.'
    }
  },

  discovery: {
    catalog: {
      eyebrow: 'Library catalog',
      title: 'Discover the collection',
      subtitle:
        'Search the active SAMS catalog and check safe branch-level availability.',
      searchPlaceholder:
        'Title, contributor, ISBN, call number, Dewey...',
      searchLabel: 'Catalog search',
      search: 'Search',
      loading: 'Loading catalog...',
      results: 'results',
      for: 'for',
      sort: 'Sort by'
    },

    filters: {
      eyebrow: 'Refine',
      title: 'Filters',
      clear: 'Clear filters',
      all: 'All',
      type: 'Material type',
      category: 'Category',
      dewey: 'Dewey classification',
      language: 'Language',
      year: 'Publication year',
      branch: 'Branch',
      availableOnly: 'Available now',
      availableOnlyHint:
        'Only show items with an available physical copy.'
    },

    sort: {
      TITLE_ASC: 'Title A-Z',
      TITLE_DESC: 'Title Z-A',
      YEAR_DESC: 'Newest publication year',
      YEAR_ASC: 'Oldest publication year',
      NEWEST: 'Recently added'
    },

    card: {
      year: 'Year',
      language: 'Language',
      dewey: 'Dewey',
      callNumber: 'Call number',
      branches: 'branches',
      details: 'View details'
    },

    availability: {
      available: 'Available',
      unavailable: 'Currently unavailable',
      noCopies: 'No listed copies'
    },

    empty: {
      title: 'No matching items',
      body:
        'Try a different search term or clear one or more filters.'
    },

    pagination: {
      label: 'Catalog pages',
      previous: 'Previous',
      next: 'Next',
      page: 'Page',
      of: 'of'
    },

    detail: {
      loading: 'Loading item details...',
      back: 'Back to catalog',
      metadataEyebrow: 'Bibliographic data',
      metadataTitle: 'Item information',
      descriptionEyebrow: 'About this item',
      descriptionTitle: 'Description / abstract',
      availabilityEyebrow: 'Live availability',
      availabilityTitle: 'Availability by branch',
      availableCopies: 'available copies',
      totalCopies: 'listed copies',
      noBranchCopies:
        'No active branch currently has a listed copy.',
      reserveReady: 'Reservation-ready',
      reserveReadyHint:
        'At least one branch currently has an available copy.',
      reserveUnavailable:
        'No copy available for reservation',
      reserveUnavailableHint:
        'You can still review the item information and check again later.',
      type: 'Material type',
      year: 'Publication year',
      language: 'Language',
      callNumber: 'Call number',
      dewey: 'Dewey classification',
      category: 'Category',
      isbn: 'ISBN',
      publisher: 'Publisher',
      edition: 'Edition',
      academicYear: 'Academic year',
      faculty: 'Faculty',
      department: 'Department'
    },

    errors: {
      facetsTitle: 'Filters could not be loaded',
      searchTitle: 'Catalog search failed',
      detailTitle: 'Item details could not be loaded'
    }
  }
};
