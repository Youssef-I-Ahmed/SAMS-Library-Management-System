BEGIN;

CREATE SCHEMA sams_research;
REVOKE ALL ON SCHEMA sams_research FROM PUBLIC;

CREATE VIEW sams_research.catalog WITH (security_barrier = true) AS
SELECT
  item.id,
  item.title,
  legacy.legacy_code,
  item.publication_year,
  item.language,
  item.call_number,
  COALESCE(subjects.names, ARRAY[]::text[]) AS subjects,
  COALESCE(people.researchers, ARRAY[]::text[]) AS researchers,
  COALESCE(people.supervisors, ARRAY[]::text[]) AS supervisors,
  EXISTS (
    SELECT 1 FROM public.physical_copies AS copy
    JOIN public.branches AS branch ON branch.id = copy.branch_id AND branch.is_active
    WHERE copy.item_id = item.id AND copy.status = 'AVAILABLE'
  ) AS available
FROM public.library_items AS item
LEFT JOIN public.legacy_catalog_identities AS legacy
  ON legacy.item_id = item.id AND legacy.source_namespace = 'LEGACY_PROJECTS_V1'
LEFT JOIN LATERAL (
  SELECT array_agg(DISTINCT subject.name ORDER BY subject.name) AS names
  FROM public.item_subjects AS link
  JOIN public.subjects AS subject ON subject.id = link.subject_id
  WHERE link.item_id = item.id
) AS subjects ON true
LEFT JOIN LATERAL (
  SELECT
    array_agg(DISTINCT person.full_name ORDER BY person.full_name)
      FILTER (WHERE link.role IN ('RESEARCHER', 'AUTHOR', 'PROJECT_MEMBER')) AS researchers,
    array_agg(DISTINCT person.full_name ORDER BY person.full_name)
      FILTER (WHERE link.role = 'SUPERVISOR') AS supervisors
  FROM public.item_contributors AS link
  JOIN public.contributors AS person ON person.id = link.contributor_id
  WHERE link.item_id = item.id
) AS people ON true
WHERE item.type = 'ACADEMIC_WORK' AND item.is_active;

REVOKE ALL ON sams_research.catalog FROM PUBLIC;
COMMIT;
