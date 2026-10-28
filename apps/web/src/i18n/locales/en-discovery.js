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
    titleLead: 'Knowledge Today,',
    titleLine: 'A Brighter',
    titleAccent: 'Tomorrow.',
    imageCaption: 'Campus concept illustration',
    browseAll: 'Explore the catalog',
    collectionNavigation: 'Browse collections',
    explore: 'Explore collection',
    collectionTitles: { BOOK: 'Books & references', THESIS: 'Theses & research', PROJECT: 'Graduation projects' },
    experienceEyebrow: 'The library experience',
    experienceTitle: 'Every idea starts with discovery.',
    steps: {
      discover: { title: 'Discover', body: 'Find a title, author or subject in the catalog.' },
      reserve: { title: 'Reserve', body: 'Manage your holds and review recorded availability.' },
      learn: { title: 'Keep learning', body: 'Follow your borrowings and return dates.' }
    },
    footerLine: 'Knowledge builds better futures.',
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
    browseTitle: 'Find your next perspective.',
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
        'Search the SAMS catalog and review recorded branch availability.',
      searchPlaceholder:
        'Title, contributor, ISBN, call number, Dewey...',
      searchLabel: 'Catalog search',
      search: 'Search',
      loading: 'Loading catalog...',
      loaded: 'Catalog loaded.',
      results: 'results',
      for: 'for',
      sort: 'Sort by',
      headerNote: 'A place for curiosity. A collection to explore.',
      allResources: 'All resources',
      resultsHeading: 'Catalog results',
      view: 'Results layout',
      grid: 'Grid view',
      list: 'List view',
      retry: 'Try again'
    },

    filters: {
      eyebrow: 'Refine',
      title: 'Filters',
      clear: 'Clear filters',
      show: 'Show filters',
      hide: 'Hide filters',
      all: 'All',
      type: 'Material type',
      category: 'Category',
      dewey: 'Dewey classification',
      language: 'Language',
      year: 'Publication year',
      branch: 'Branch',
      availableOnly: 'Listed as available',
      availableOnlyHint:
        'Show items with a copy recorded as available, including any demo copies.'
    },

    sort: {
      TITLE_ASC: 'Title A-Z',
      TITLE_DESC: 'Title Z-A',
      YEAR_DESC: 'Newest publication year',
      YEAR_ASC: 'Oldest publication year',
      NEWEST: 'Recently added'
    },

    card: {
      noCover: 'Cover not supplied',
      noContributor: 'Contributor not listed',
      year: 'Year',
      language: 'Language',
      dewey: 'Dewey',
      callNumber: 'Call number',
      branches: 'listed branches',
      details: 'View details'
    },

    availability: {
      available: 'Available in records',
      unavailable: 'Unavailable in records',
      noCopies: 'No listed copies'
    },

    inventoryNotice: {
      title: 'Confirm physical availability',
      body:
        'System availability may include demo copies and does not confirm physical stock. Check with the library before visiting, even with a reservation.'
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
      sections: 'Item sections',
      loaded: 'Item details loaded.',
      missingTitle: 'Item not found',
      missingBody: 'This library record is unavailable. Return to the catalog to explore other items.',
      requestId: 'Request ID',
      refreshError: 'Recorded availability could not be refreshed',
      loading: 'Loading item details...',
      back: 'Back to catalog',
      metadataEyebrow: 'Bibliographic data',
      metadataTitle: 'Item information',
      descriptionEyebrow: 'About this item',
      descriptionTitle: 'Description / abstract',
      availabilityEyebrow: 'Recorded availability',
      availabilityTitle: 'Records by branch',
      availableCopies: 'listed as available',
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
