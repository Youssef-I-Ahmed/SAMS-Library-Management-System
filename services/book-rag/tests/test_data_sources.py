import json
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
import hashlib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.data_sources import convert_rows, load_legacy_map, SourceUnavailable
from app.catalog_runtime import CatalogRuntime

A = "4afd2005-c0c3-5889-911a-b3952b7ef670"
B = "fe19858e-1ab4-5a75-abe6-d90f07a09e6e"


def row(target=A, **patch):
    return {"id": target, "title": "Book", "publication_year": 2007, "isbn": "000123",
            "contributors": [{"name": "Author", "role": "AUTHOR"}], **patch}


class SourceTests(unittest.TestCase):
    def test_exact_codes_and_uuid_native_identity_no_title_join(self):
        result = convert_rows([row(), row(B)], {"0002": A, "1687": A})
        self.assertEqual([r["BOOK_CODE"] for r in result.records], ["0002", "1687", "sams:"+B])
        self.assertEqual(result.item_count, 2)
        self.assertTrue(all(r["ISBN"] == "000123" for r in result.records))
        self.assertTrue(all(r["NUM_OF_COPIES"] is None for r in result.records))

    def test_contributors_details_classification_and_deletion_invalidate_without_updated_at(self):
        original = convert_rows([row()], {})
        for change in [dict(isbn="000124"), dict(contributors=[{"name": "Other", "role": "EDITOR"}]),
                       dict(contributors=[{"name": "Author", "role": "EDITOR"}]),
                       dict(category="Management"), dict(dewey_name="Science"), dict(title="New title")]:
            self.assertNotEqual(original.revision, convert_rows([row(**change)], {}).revision)
        self.assertNotEqual(original.revision, convert_rows([], {}).revision)
        self.assertEqual(original.revision, convert_rows([row()], {}).revision)

    def test_map_provenance_duplicate_keys_and_leading_zeros(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/"map.json"
            path.write_text(json.dumps({"sourceSha256":"a"*64,"map":{"0002":A}}))
            sha = hashlib.sha256(path.read_bytes()).hexdigest()
            self.assertEqual(load_legacy_map(path, sha, "a"*64), {"0002":A})
            with self.assertRaises(SourceUnavailable): load_legacy_map(path, "b"*64, "a"*64)
            path.write_text('{"sourceSha256":"'+"a"*64+'","map":{"2":"'+A+'","2":"'+B+'"}}')
            with self.assertRaises(SourceUnavailable): load_legacy_map(path, hashlib.sha256(path.read_bytes()).hexdigest(), "a"*64)

    def test_1687_1896_remain_distinct_targets_before_rag_grouping(self):
        result = convert_rows([row(), row(B)], {"1687": A, "1896": B})
        self.assertEqual([r["BOOK_CODE"] for r in result.records], ["1687", "1896"])

    def test_atomic_publication_same_revision_no_build_and_failure_not_stale_success(self):
        now = [0]
        source = [convert_rows([row()], {})]
        builds = []
        provider = SimpleNamespace(fetch=lambda: source[0])
        def build(value):
            builds.append(value.revision)
            return SimpleNamespace(revision=value.revision, namespace="unit_snapshot", engine=object())
        runtime = CatalogRuntime(provider, builder=build, clock=lambda: now[0])
        runtime.refresh(); old = runtime.current()
        runtime.refresh(); self.assertEqual(len(builds), 1)
        source[0] = convert_rows([row(title="Changed")], {})
        runtime.refresh(); self.assertNotEqual(runtime.current().revision, old.revision)
        self.assertEqual(old.revision, builds[0])  # in-flight users keep the old object
        now[0] = 31
        with self.assertRaises(SourceUnavailable): runtime.current()
        provider.fetch = lambda: (_ for _ in ()).throw(OSError("private connection details"))
        with self.assertRaisesRegex(SourceUnavailable, "^Catalog source unavailable$"): runtime.refresh()
        with self.assertRaises(SourceUnavailable): runtime.current()

    def test_slow_build_does_not_stamp_an_old_database_read_as_fresh(self):
        now = [0]
        source = convert_rows([row()], {})
        def build(value):
            now[0] += 31
            return SimpleNamespace(revision=value.revision, namespace="slow_snapshot", engine=object())
        runtime = CatalogRuntime(SimpleNamespace(fetch=lambda: source), builder=build, clock=lambda: now[0])
        runtime.refresh()
        with self.assertRaises(SourceUnavailable): runtime.current()
        runtime.refresh()  # same source re-confirmed after the build, no rebuild
        self.assertEqual(runtime.current().revision, source.revision)


if __name__ == "__main__": unittest.main()
