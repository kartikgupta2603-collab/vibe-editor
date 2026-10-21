"""Shared, explicitly approximate RGB looks; never change monitor calibration."""

import json
import math
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def custom_rgb_profile() -> dict:
    path = Path(__file__).resolve().parents[1] / "static" / "color-profiles.json"
    profile = json.loads(path.read_text(encoding="utf-8"))["intel_custom"]
    if profile.get("id") != "intel_custom":
        raise ValueError("The Custom RGB profile has an invalid identifier.")
    for key in ("rgb_slope", "rgb_offset"):
        values = profile.get(key)
        if not isinstance(values, list) or len(values) != 3 or any(
            isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)
            for value in values
        ):
            raise ValueError(f"The Custom RGB profile requires three finite {key} values.")
    saturation = profile.get("saturation")
    if isinstance(saturation, bool) or not isinstance(saturation, (int, float)) or not math.isfinite(saturation) or saturation < 0:
        raise ValueError("The Custom RGB profile requires a finite nonnegative saturation.")
    return profile


def _matrix_filter(rows: list[list[float]]) -> str:
    factor = max(1.0, max(abs(value) for row in rows for value in row) / 2)
    names = (("rr", "rg", "rb"), ("gr", "gg", "gb"), ("br", "bg", "bb"))
    matrix = "colorchannelmixer=" + ":".join(
        f"{name}={value / factor:.9f}" for row_names, row in zip(names, rows)
        for name, value in zip(row_names, row)
    )
    if factor == 1:
        return matrix
    # The SIMD matrix accepts coefficients only within [-2, 2]. Uniformly
    # divide every coefficient, then restore that positive gain with a LUT.
    # Clipping below zero and above white commutes with this uniform scale;
    # unlike chained saturation passes, the transform and clipping order stay
    # intact. A 16-bit intermediate limits the final 8-bit rounding difference
    # to one level while avoiding slow per-pixel GEQ expressions at 3x/4x.
    gain = "lutrgb=" + ":".join(
        f"{channel}='floor(clip(val*{factor:.9f},0,maxval)+0.5)'" for channel in "rgb"
    )
    return f"format=gbrp16le,{matrix},{gain},format=gbrp"


def saturation_filter(amount: float) -> str:
    """The sRGB CSS/SVG saturation matrix, rather than YUV chroma gain."""
    weights = (0.213, 0.715, 0.072)
    return _matrix_filter([
        [weight * (1 - amount) + (amount if row == column else 0)
         for column, weight in enumerate(weights)] for row in range(3)
    ])


def _rgb_lut(slopes: list[float], offsets: list[float]) -> str:
    # Match the shared 256-entry SVG discrete tables, including clipping and
    # half-up 8-bit rounding, instead of using a different YUV eq operation.
    return "lutrgb=" + ":".join(
        f"{channel}='floor(clip(val*{slope:.9f}+{offset * 255:.9f},0,255)+0.5)'"
        for channel, slope, offset in zip("rgb", slopes, offsets)
    )


def custom_rgb_filters(intensity: float, adjustments: dict) -> str:
    """RGB software approximation inspired by the recorded Intel controls.

    Intel's driver transfer function is undocumented; this is an editable look,
    not an assertion that those slider numbers are a measured display profile.
    """
    profile = custom_rgb_profile()
    filters = ["format=gbrp"]
    brightness = max(0.1, 1 + float(adjustments.get("brightness", 0)) / 100)
    contrast = max(0.1, float(adjustments.get("contrast", 100)) / 100)
    saturation = max(0, float(adjustments.get("saturation", 100)) / 100)
    if brightness != 1:
        filters.append(_rgb_lut([brightness] * 3, [0] * 3))
    if contrast != 1:
        filters.append(_rgb_lut([contrast] * 3, [(1 - contrast) / 2] * 3))
    if saturation != 1:
        filters.append(saturation_filter(saturation))
    warmth = float(adjustments.get("warmth", 0))
    sepia = min(1, max(0, warmth / 100 * 0.25))
    if sepia > 0.01:
        sepia_matrix = ((0.393, 0.769, 0.189), (0.349, 0.686, 0.168), (0.272, 0.534, 0.131))
        filters.append(_matrix_filter([
            [(1 - sepia if row == column else 0) + value * sepia
             for column, value in enumerate(values)] for row, values in enumerate(sepia_matrix)
        ]))
    hue = -warmth * (0.15 if warmth > 0 else 0.25)
    if abs(hue) > 0.1:
        cosine, sine = math.cos(math.radians(hue)), math.sin(math.radians(hue))
        filters.append(_matrix_filter([
            [0.213 + cosine * 0.787 - sine * 0.213, 0.715 - cosine * 0.715 - sine * 0.715, 0.072 - cosine * 0.072 + sine * 0.928],
            [0.213 - cosine * 0.213 + sine * 0.143, 0.715 + cosine * 0.285 + sine * 0.140, 0.072 - cosine * 0.072 - sine * 0.283],
            [0.213 - cosine * 0.213 - sine * 0.787, 0.715 - cosine * 0.715 + sine * 0.715, 0.072 + cosine * 0.928 + sine * 0.072],
        ]))
    slopes = [1 + (value - 1) * intensity for value in profile["rgb_slope"]]
    offsets = [value * intensity for value in profile["rgb_offset"]]
    if intensity > 0:
        filters.append(_rgb_lut(slopes, offsets))
        filters.append(saturation_filter(1 + (profile["saturation"] - 1) * intensity))
    vignette = float(adjustments.get("vignette", 0))
    if vignette > 0.5:
        filters.append(f"vignette=angle={round(0.2 + vignette / 100 * 0.65, 3)}")
    return "," + ",".join(filters)
