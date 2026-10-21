import os
import sys
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.video.probe import probe_video
from app.video.renderer import renderer
from app.templates.template_manager import template_manager
from app.projects.project_manager import project_manager

def test_probe():
    print("Testing probe...")
    info = probe_video(str(BASE_DIR / "temp" / "test_16_9_with_audio.mp4"))
    assert info.width == 1920 and info.height == 1080, f"Expected 1920x1080, got {info.width}x{info.height}"
    assert info.aspect_ratio == "16:9", f"Expected 16:9, got {info.aspect_ratio}"
    assert info.has_audio is True, "Expected audio stream"
    print("  probe 1080p with audio OK")

    info_no_audio = probe_video(str(BASE_DIR / "temp" / "test_no_audio.mp4"))
    assert info_no_audio.has_audio is False, "Expected no audio"
    print("  probe no audio OK")

    info_720 = probe_video(str(BASE_DIR / "temp" / "test_720p.mp4"))
    assert info_720.width == 1280 and info_720.height == 720
    print("  probe 720p OK")

def test_templates():
    print("Testing templates...")
    tpls = template_manager.list_templates()
    assert len(tpls) >= 6, f"Expected at least 6 templates, found {len(tpls)}"
    cinematic = template_manager.get_template("cinematic")
    assert cinematic["name"] == "Cinematic"
    print(f"  templates OK ({len(tpls)} found)")

def test_render(tmp_path):
    print("Testing Reel rendering...")
    src = str(BASE_DIR / "temp" / "test_16_9_with_audio.mp4")
    out = str(tmp_path / "test_kick_back_reel.mp4")
    tpl = template_manager.get_template("cinematic")

    rendered = renderer.render_reel(
        source_video=src,
        output_mp4=out,
        start_time=1.0,
        end_time=5.0,
        series_text="DAY 1 OF POSTING\nTHE BEST ANIME SONGS",
        song_name="KICK BACK",
        anime_name="Chainsaw Man",
        caption="This song just hits different.",
        template=tpl
    )
    assert Path(rendered).exists(), "Exported MP4 does not exist"
    
    # Inspect output
    out_info = probe_video(rendered)
    print(f"  Exported resolution: {out_info.width}x{out_info.height}")
    assert out_info.width == 2160 and out_info.height == 3840, f"Expected 2160x3840, got {out_info.width}x{out_info.height}"
    assert out_info.aspect_ratio == "9:16", f"Expected 9:16, got {out_info.aspect_ratio}"
    assert out_info.has_audio is True, "Expected audio in final Reel"
    assert out_info.duration > 3.5, f"Expected ~4s duration, got {out_info.duration}"
    print("  render 2160x3840 9:16 with audio OK")

def test_render_no_audio_source(tmp_path):
    print("Testing Reel rendering from audio-less source...")
    src = str(BASE_DIR / "temp" / "test_no_audio.mp4")
    out = str(tmp_path / "test_no_audio_reel.mp4")
    tpl = template_manager.get_template("minimal")

    rendered = renderer.render_reel(
        source_video=src,
        output_mp4=out,
        start_time=0.0,
        end_time=3.0,
        series_text="DAY 2 OF POSTING\nTHE BEST ANIME SONGS",
        song_name="UNRAVEL",
        anime_name="Tokyo Ghoul",
        caption="Some songs never get old.",
        template=tpl
    )
    assert Path(rendered).exists()
    out_info = probe_video(rendered)
    assert out_info.width == 2160 and out_info.height == 3840
    print("  render audio-less source fallback OK")

if __name__ == "__main__":
    test_probe()
    test_templates()
    test_render()
    test_render_no_audio_source()
    print("\n=== ALL PHASE 1 TESTS PASSED SUCCESSFULLY! ===")
