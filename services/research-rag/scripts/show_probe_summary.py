import json
from pathlib import Path

report = Path("data/processed/compare_hybrid_weights_detailed.json")
data = json.loads(report.read_text(encoding="utf-8"))

print("EXPERIMENTS:", ", ".join(data["experiments"]))

for experiment, probes in data["per_probe"].items():
    print(f"\n=== {experiment} ===")

    for probe in probes:
        print(
            f'\nProbe {probe["probe"]}: '
            f'AR={probe["arabic_query"]} | '
            f'EN={probe["english_query"]}'
        )

        for language, label in (("ar", "Arabic"), ("en", "English")):
            result = probe["queries"][language]
            top5 = result["top10"][:5]

            print(f"  {label}:")
            for item in top5:
                print(f'    {item["record_id"]} | {item["title"]}')