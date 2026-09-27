"""Focused tests for the 9:16 vertical reel background coverage.

Verifies that _cover_scale always produces dimensions that fully
cover the target canvas for various source aspect ratios.
"""
import math
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.video.renderer import _cover_scale


def test_cover_scale_landscape_16_9():
    """1920x1080 source covering 1080x1920 vertical canvas."""
    w, h = _cover_scale(1920, 1080, 1080, 1920, zoom=1.25)
    assert w >= 1080, f"Width {w} < 1080"
    assert h >= 1920, f"Height {h} < 1920"
    assert w % 2 == 0, f"Width {w} is odd"
    assert h % 2 == 0, f"Height {h} is odd"
    # Verify aspect ratio preserved (within 1px tolerance from ceiling)
    original_ar = 1920 / 1080
    result_ar = w / h
    assert abs(original_ar - result_ar) < 0.02, f"AR distorted: {result_ar:.4f} vs {original_ar:.4f}"


def test_cover_scale_portrait_source():
    """A 1080x1920 portrait source covering 1080x1920 — should be 1:1 scale * zoom."""
    w, h = _cover_scale(1080, 1920, 1080, 1920, zoom=1.25)
    assert w >= 1080, f"Width {w} < 1080"
    assert h >= 1920, f"Height {h} < 1920"
    assert w % 2 == 0 and h % 2 == 0


def test_cover_scale_square_source():
    """1080x1080 square source covering 1080x1920 vertical."""
    w, h = _cover_scale(1080, 1080, 1080, 1920, zoom=1.0)
    assert w >= 1080, f"Width {w} < 1080"
    assert h >= 1920, f"Height {h} < 1920"
    assert w % 2 == 0 and h % 2 == 0


def test_cover_scale_4k_source():
    """3840x2160 (4K 16:9) source covering 1080x1920."""
    w, h = _cover_scale(3840, 2160, 1080, 1920, zoom=1.25)
    assert w >= 1080, f"Width {w} < 1080"
    assert h >= 1920, f"Height {h} < 1920"
    assert w % 2 == 0 and h % 2 == 0


def test_cover_scale_ultrawide():
    """2560x1080 ultrawide source covering 1080x1920."""
    w, h = _cover_scale(2560, 1080, 1080, 1920, zoom=1.25)
    assert w >= 1080, f"Width {w} < 1080"
    assert h >= 1920, f"Height {h} < 1920"
    assert w % 2 == 0 and h % 2 == 0


def test_cover_scale_no_zoom():
    """Minimum zoom=1.0 still covers canvas."""
    w, h = _cover_scale(1920, 1080, 1080, 1920, zoom=1.0)
    assert w >= 1080, f"Width {w} < 1080"
    assert h >= 1920, f"Height {h} < 1920"


def test_cover_scale_landscape_export():
    """1920x1080 source for 1920x1080 landscape export."""
    w, h = _cover_scale(1920, 1080, 1920, 1080, zoom=1.25)
    assert w >= 1920, f"Width {w} < 1920"
    assert h >= 1080, f"Height {h} < 1080"
    assert w % 2 == 0 and h % 2 == 0


def test_cover_scale_square_export():
    """1920x1080 source for 1080x1080 square export."""
    w, h = _cover_scale(1920, 1080, 1080, 1080, zoom=1.25)
    assert w >= 1080, f"Width {w} < 1080"
    assert h >= 1080, f"Height {h} < 1080"
    assert w % 2 == 0 and h % 2 == 0


if __name__ == "__main__":
    test_cover_scale_landscape_16_9()
    test_cover_scale_portrait_source()
    test_cover_scale_square_source()
    test_cover_scale_4k_source()
    test_cover_scale_ultrawide()
    test_cover_scale_no_zoom()
    test_cover_scale_landscape_export()
    test_cover_scale_square_export()
    print("All _cover_scale tests passed!")
