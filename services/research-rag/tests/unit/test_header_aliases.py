import openpyxl
import pytest

from src.data.loader import read_raw_rows
from src.data.schema import SOURCE_COLUMNS, canonical_header

NEW_HEADER = ["BOOK_CODE", "TITLE", "Students", "Supervisor", " PUBLISHING_DATE", " CALL_NUM", " EXTENT", "DIMENSION", "SUBJECTS"]
OLD_HEADER = list(SOURCE_COLUMNS)


def _write(tmp_path, header):
    p = tmp_path / "x.xlsx"
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(header); ws.append(["1", "t", "NA", "NA", "2014", "3", "9 ص", "1*2", "بنوك"])
    wb.save(p)
    return p


@pytest.mark.parametrize("header", [OLD_HEADER, NEW_HEADER])
def test_both_header_layouts_load_identically(tmp_path, header):
    h, rows, _ = read_raw_rows(_write(tmp_path, header))
    assert h == OLD_HEADER and rows[0]["WORK | PUBLISHING_DATE"] == "2014" and rows[0]["SUBJECTS_ALL"] == "بنوك"


def test_unknown_or_missing_columns_fail_loudly_not_silently(tmp_path):
    with pytest.raises(ValueError, match="Missing required column"):
        read_raw_rows(_write(tmp_path, NEW_HEADER[:-1] + ["TOPICS"]))
    assert canonical_header("  work |  call_num ") == "WORK | CALL_NUM"
