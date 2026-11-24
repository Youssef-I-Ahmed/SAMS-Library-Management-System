-- Hand-written DDL that MIRRORS prisma/schema.prisma (tables `users`, `projects`).
-- Why not `prisma migrate`/`db push`? They need the schema-engine binary from binaries.prisma.sh, which is blocked in the
-- build environment. With the team's real Prisma project, use their migrations instead and only keep the VIEW part below.
CREATE TABLE users (
  id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'STUDENT');
CREATE TABLE projects (
  id SERIAL PRIMARY KEY, book_code TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  students TEXT[] NOT NULL DEFAULT '{}', supervisors TEXT[] NOT NULL DEFAULT '{}',
  publishing_date TEXT, call_num TEXT, extent TEXT, dimension TEXT, subjects_all TEXT[] NOT NULL DEFAULT '{}');

-- Read-only contract between PostgreSQL (authoritative) and the Python RAG service (docs/INTEGRATION.md §1)
CREATE VIEW rag_projects_v AS
SELECT book_code AS record_id, title, students, supervisors, publishing_date AS year, call_num AS call_number,
       extent, dimension, subjects_all AS subjects
FROM projects;
CREATE ROLE rag_reader LOGIN PASSWORD 'rag_reader_test_pw';
GRANT SELECT ON rag_projects_v TO rag_reader;
