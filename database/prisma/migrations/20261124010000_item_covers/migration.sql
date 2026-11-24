-- Cover images: an uploaded file name (served by the API) and when it changed.
ALTER TABLE "library_items"
  ADD COLUMN "cover_image_path" TEXT,
  ADD COLUMN "cover_updated_at" TIMESTAMPTZ(6),
  ADD CONSTRAINT "chk_library_items_cover_path" CHECK (
    "cover_image_path" IS NULL OR "cover_image_path" ~ '^[0-9a-f-]{36}-[0-9a-f]{12}\.(jpg|png|webp)$'
  );
