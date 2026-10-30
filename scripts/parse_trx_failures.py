#!/usr/bin/env python3
"""Parse trx report -> extract failure messages per test (M-U7f diagnosis)."""
import re, sys
import xml.etree.ElementTree as ET

trx = "/tmp/gh-repo-staging/unity/pixel-world-box/TestResults/res.trx"
tree = ET.parse(trx)
ns = {"mst": "http://microsoft.com/schemas/VisualStudio/TeamTest/2010"}
root = tree.getroot()

for ut in root.iter("{http://microsoft.com/schemas/VisualStudio/TeamTest/2010}UnitTestResult"):
    if ut.get("outcome") != "Failed":
        continue
    name = ut.get("testName")
    msg_el = ut.find(".//mst:Message", ns)
    msg = (msg_el.text or "") if msg_el is not None else ""
    msg = re.sub(r"\s+\n", "\n", msg)
    # truncate long messages
    lines = msg.splitlines()
    if len(lines) > 14:
        lines = lines[:14] + [f"...({len(lines)-14} more lines)"]
    print(f"=== {name}")
    for ln in lines:
        print("   ", ln[:300])
    print()
