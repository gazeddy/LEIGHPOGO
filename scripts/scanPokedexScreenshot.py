#!/usr/bin/env python3
import csv
import io
import json
import math
import re
import statistics
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image

MAX_DEX_NUMBER = 5000
MIN_OCR_CONFIDENCE = 20.0
GRID_COLUMNS = 4
NUMBER_RE = re.compile(r"^0*(\d{3,4})$")


def clamp(value, lower, upper):
    return max(lower, min(upper, value))


def run_tesseract(image_path):
    command = [
        "tesseract",
        "-c",
        "tessedit_char_whitelist=0123456789",
        str(image_path),
        "stdout",
        "--psm",
        "11",
        "-l",
        "eng",
        "tsv",
    ]
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=25,
    )
    if completed.returncode != 0:
        message = completed.stderr.strip() or "Tesseract failed"
        raise RuntimeError(message)
    return completed.stdout


def parse_ocr_entries(tsv_text, image_width, image_height):
    candidates = []
    reader = csv.DictReader(io.StringIO(tsv_text), delimiter="\t")

    for row in reader:
        text = (row.get("text") or "").strip()
        match = NUMBER_RE.match(text)
        if not match:
            continue

        dex_number = int(match.group(1))
        if dex_number <= 0 or dex_number > MAX_DEX_NUMBER:
            continue

        try:
            confidence = float(row.get("conf") or -1)
            left = int(row.get("left") or 0)
            top = int(row.get("top") or 0)
            width = int(row.get("width") or 0)
            height = int(row.get("height") or 0)
        except (TypeError, ValueError):
            continue

        if confidence < MIN_OCR_CONFIDENCE or width <= 0 or height <= 0:
            continue

        center_x = left + width / 2.0
        center_y = top + height / 2.0

        # Phone status/header counters live above the Pokédex grid.
        if center_y < image_height * 0.12:
            continue

        column = clamp(int((center_x / image_width) * GRID_COLUMNS), 0, GRID_COLUMNS - 1)
        expected_center_x = ((column + 0.5) / GRID_COLUMNS) * image_width

        # Grid numbers are centred in their quarter-width tile. This rejects
        # unrelated counters while remaining tolerant of cropped screenshots.
        if abs(center_x - expected_center_x) > image_width * 0.105:
            continue

        candidates.append(
            {
                "dexNumber": dex_number,
                "confidence": confidence,
                "left": left,
                "top": top,
                "width": width,
                "height": height,
                "centerX": center_x,
                "centerY": center_y,
                "column": column,
                "inferred": False,
            }
        )

    if not candidates:
        return []

    # Keep the highest-confidence OCR result when Tesseract reports a number twice.
    by_dex = {}
    for entry in candidates:
        existing = by_dex.get(entry["dexNumber"])
        if existing is None or entry["confidence"] > existing["confidence"]:
            by_dex[entry["dexNumber"]] = entry

    return sorted(by_dex.values(), key=lambda entry: entry["dexNumber"])


def infer_clipped_top_row_entries(entries, image_width):
    """Recover leading cells whose raised number is hidden above the viewport.

    Pokémon GO's four-column regional Pokédex is strictly sequential. When the
    screen is stopped part-way through a row, an empty uncaught tile can have
    its number raised high enough to sit behind the region header while caught
    neighbours still show their lower labels. For example, visible 835/836/837
    in columns 1/2/3 proves that the clipped column-0 tile is 834.

    Only the visually top-most row is reconstructed, and at least two OCR'd
    neighbours must agree on the same row base. That keeps this inference
    deliberately narrow and leaves normal OCR failures for manual review.
    """
    if len(entries) < 2:
        return entries

    rows = defaultdict(list)
    for entry in entries:
        row_base = entry["dexNumber"] - entry["column"]
        rows[row_base].append(entry)

    eligible_rows = [
        (row_base, row_entries)
        for row_base, row_entries in rows.items()
        if len(row_entries) >= 2
    ]
    if not eligible_rows:
        return entries

    top_row_base, top_row_entries = min(
        eligible_rows,
        key=lambda item: statistics.median(entry["centerY"] for entry in item[1]),
    )

    observed_columns = {entry["column"] for entry in top_row_entries}
    first_observed_column = min(observed_columns)
    if first_observed_column <= 0:
        return entries

    # Require at least two adjacent visible neighbours so one stray OCR number
    # cannot manufacture a leading Pokédex entry.
    adjacent_pairs = sum(
        1
        for column in observed_columns
        if column + 1 in observed_columns
    )
    if adjacent_pairs < 1:
        return entries

    row_baseline = max(entry["top"] for entry in top_row_entries)
    median_width = max(1, int(statistics.median(entry["width"] for entry in top_row_entries)))
    median_height = max(1, int(statistics.median(entry["height"] for entry in top_row_entries)))
    cell_width = image_width / GRID_COLUMNS
    inferred_raise = max(24, int(cell_width * 0.32))

    inferred_entries = []
    for column in range(first_observed_column):
        if column in observed_columns:
            continue

        dex_number = top_row_base + column
        if dex_number <= 0 or dex_number > MAX_DEX_NUMBER:
            continue

        center_x = ((column + 0.5) / GRID_COLUMNS) * image_width
        top = max(0, row_baseline - inferred_raise)
        inferred_entries.append(
            {
                "dexNumber": dex_number,
                "confidence": 0.0,
                "left": int(center_x - median_width / 2),
                "top": top,
                "width": median_width,
                "height": median_height,
                "centerX": center_x,
                "centerY": top + median_height / 2.0,
                "column": column,
                "inferred": True,
            }
        )

    if not inferred_entries:
        return entries

    return sorted(entries + inferred_entries, key=lambda entry: entry["dexNumber"])


def channel_std(pixels):
    if not pixels:
        return 0.0
    count = len(pixels)
    means = [sum(pixel[channel] for pixel in pixels) / count for channel in range(3)]
    variances = []
    for channel in range(3):
        variance = sum((pixel[channel] - means[channel]) ** 2 for pixel in pixels) / count
        variances.append(math.sqrt(variance))
    return sum(variances) / 3.0


def median_colour(pixels):
    if not pixels:
        return (0, 0, 0)
    return tuple(int(statistics.median(pixel[channel] for pixel in pixels)) for channel in range(3))


def analyse_sprite_area(image, entry, row_baseline, cell_width):
    image_width, image_height = image.size
    column = entry["column"]

    left = int(column * cell_width + cell_width * 0.12)
    right = int((column + 1) * cell_width - cell_width * 0.12)
    top = int(row_baseline - cell_width * 0.86)
    bottom = int(row_baseline - max(5, entry["height"] * 0.55))

    left = clamp(left, 0, image_width - 1)
    right = clamp(right, left + 1, image_width)
    top = clamp(top, 0, image_height - 1)
    bottom = clamp(bottom, top + 1, image_height)

    crop = image.crop((left, top, right, bottom)).convert("RGB")
    if crop.width > 140:
        scale = 140 / crop.width
        crop = crop.resize((140, max(1, int(crop.height * scale))), Image.Resampling.BILINEAR)

    pixels = list(crop.getdata())
    if not pixels:
        return {
            "allStd": 0.0,
            "foregroundStd": 0.0,
            "foregroundFraction": 0.0,
            "darkFraction": 0.0,
            "meanChroma": 0.0,
        }

    corner_w = max(2, crop.width // 9)
    corner_h = max(2, crop.height // 9)
    corners = []
    for x0 in (0, crop.width - corner_w):
        for y0 in (0,):
            corners.extend(crop.crop((x0, y0, x0 + corner_w, y0 + corner_h)).getdata())
    background = median_colour(corners)

    foreground = []
    distance_threshold_sq = 30 * 30
    for pixel in pixels:
        distance_sq = sum((pixel[channel] - background[channel]) ** 2 for channel in range(3))
        if distance_sq > distance_threshold_sq:
            foreground.append(pixel)

    foreground_fraction = len(foreground) / len(pixels)
    if foreground:
        dark_count = 0
        chroma_total = 0.0
        for red, green, blue in foreground:
            brightness = (red + green + blue) / 3.0
            if brightness < 100:
                dark_count += 1
            chroma_total += max(red, green, blue) - min(red, green, blue)
        dark_fraction = dark_count / len(foreground)
        mean_chroma = chroma_total / len(foreground)
    else:
        dark_fraction = 0.0
        mean_chroma = 0.0

    return {
        "allStd": round(channel_std(pixels), 2),
        "foregroundStd": round(channel_std(foreground), 2),
        "foregroundFraction": round(foreground_fraction, 4),
        "darkFraction": round(dark_fraction, 4),
        "meanChroma": round(mean_chroma, 2),
    }


def classify_entry(entry, row_baseline, cell_width, metrics):
    if entry.get("inferred"):
        return (
            "missing",
            0.84,
            "uncaught tile inferred from neighbouring Pokédex numbers; its raised number is clipped above the viewport",
        )

    raised_amount = row_baseline - entry["top"]
    raised_threshold = max(18.0, cell_width * 0.20)

    if raised_amount >= raised_threshold:
        return "missing", 0.99, "number is positioned in an empty Pokédex tile"

    all_std = metrics["allStd"]
    foreground_std = metrics["foregroundStd"]
    foreground_fraction = metrics["foregroundFraction"]
    dark_fraction = metrics["darkFraction"]
    mean_chroma = metrics["meanChroma"]

    # Fallback for a row where every visible tile is empty, so no lower label
    # exists in that row to provide the usual positional signal.
    if all_std < 15.8 and foreground_std < 39.0:
        return "missing", 0.86, "tile appears empty"

    # Seen-but-not-caught Pokémon are rendered as dark silhouettes. Keep this
    # deliberately conservative and surface borderline cases for user review.
    if (
        foreground_fraction >= 0.05
        and dark_fraction >= 0.55
        and mean_chroma < 32.0
        and foreground_std < 45.0
    ):
        return "missing", 0.76, "sprite resembles an uncaught silhouette"

    if (
        (dark_fraction >= 0.48 and mean_chroma < 38.0 and foreground_std < 48.0)
        or (all_std < 18.0 and foreground_fraction < 0.07 and mean_chroma < 45.0)
    ):
        return "uncertain", 0.55, "image needs a quick manual check"

    return "caught", 0.78, "full sprite detected"


def scan_image(image_path):
    with Image.open(image_path) as source:
        image = source.convert("RGB")

    width, height = image.size
    tsv = run_tesseract(image_path)
    entries = parse_ocr_entries(tsv, width, height)

    if not entries:
        return {
            "width": width,
            "height": height,
            "entries": [],
            "warning": "No Pokédex grid numbers were recognised.",
        }

    entries = infer_clipped_top_row_entries(entries, width)

    cell_width = width / GRID_COLUMNS
    rows = defaultdict(list)
    for entry in entries:
        # Within one four-column Pokédex row, dexNumber - column is constant.
        # Using that exact base also lets us reconstruct a clipped leading cell.
        row_key = entry["dexNumber"] - entry["column"]
        rows[row_key].append(entry)

    output_entries = []
    for row_entries in rows.values():
        # Empty entries show their number higher in the tile. A caught entry in
        # the same row supplies the lower baseline via max(top).
        row_baseline = max(entry["top"] for entry in row_entries)
        for entry in row_entries:
            metrics = analyse_sprite_area(image, entry, row_baseline, cell_width)
            classification, confidence, reason = classify_entry(
                entry, row_baseline, cell_width, metrics
            )
            output_entries.append(
                {
                    "dexNumber": entry["dexNumber"],
                    "classification": classification,
                    "confidence": round(confidence, 2),
                    "reason": reason,
                    "ocrConfidence": (
                        None
                        if entry.get("inferred")
                        else round(entry["confidence"] / 100.0, 3)
                    ),
                    "inferred": bool(entry.get("inferred")),
                    "metrics": metrics,
                }
            )

    output_entries.sort(key=lambda entry: entry["dexNumber"])
    return {
        "width": width,
        "height": height,
        "entries": output_entries,
        "warning": None,
    }


def main():
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: scanPokedexScreenshot.py IMAGE"}))
        return 2

    image_path = Path(sys.argv[1])
    try:
        result = scan_image(image_path)
    except subprocess.TimeoutExpired:
        print(json.dumps({"error": "OCR timed out while reading the screenshot."}))
        return 1
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        return 1

    print(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
