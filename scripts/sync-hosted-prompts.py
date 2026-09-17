"""Copy browser evidence contracts into the installable Python package.

Run after changing site/shared recipe or procedure instructions. CI checks drift.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def shared_prompts():
    result = {}
    for filename, names in {
        "recipe.ts": ["RECIPE_INSTRUCTIONS", "RECIPE_SCHEMA"],
        "procedure.ts": ["PROCEDURE_INSTRUCTIONS"],
    }.items():
        source = (ROOT / "site/shared" / filename).read_text()
        for name in names:
            match = re.search(r"export const " + name + r" = `([\s\S]*?)`;", source)
            if not match:
                raise ValueError(f"Missing shared prompt: {name}")
            result[name] = match[1]
    return result


if __name__ == "__main__":
    target = ROOT / "src/videolens/analysis/evidence_prompts.json"
    target.write_text(json.dumps(shared_prompts(), indent=2, ensure_ascii=False) + "\n")
