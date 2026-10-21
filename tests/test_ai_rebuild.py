"""Dedicated transcription and song selection contracts without live Gemini requests."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi.testclient import TestClient
from app import main
from app.ai import subtitles as sub, song_analysis as song
from app.ai.gemini_client import sanitize_lyric_cues
from app.ai.gemini_transport import GeminiError


def segments(duration, start=1, end=3):
    return {'language':'English','segments': [
        {'start':0,'end':start,'kind':'instrumental','original':'','english':'','romanized':''},
        {'start':start,'end':end,'kind':'vocal','original':'Hello from the studio','english':'Hello from the studio','romanized':''},
        {'start':end,'end':duration,'kind':'instrumental','original':'','english':'','romanized':''}]}

@pytest.fixture
def transcription(monkeypatch):
    monkeypatch.setattr(sub,'_probe_audio',lambda p:(100.,0))
    extractions=[]
    def extract(p,start,end):
        extractions.append((start,end)); return 'real-audio-mocked',end-start
    monkeypatch.setattr(sub,'_extract_audio',extract)
    api=AsyncMock(side_effect=[(segments(90),'test'),(segments(10),'test')])
    monkeypatch.setattr(sub,'generate_json',api)
    return api,extractions


def test_full_transcription_covers_source_in_chunks_and_rebases_each_once(transcription):
    api,extractions=transcription
    result=asyncio.run(sub.generate_subtitles('source.mp4','key'))
    assert extractions==[(0.,90.),(90.,100.)]
    assert [(c['start'],c['end']) for c in result['lyrics']]==[(1,3),(91,93)]
    assert all(c['timeline_basis']=='absolute' for c in result['lyrics'])
    assert 'subtitle_style' not in result and 'recommended_start' not in result
    assert api.call_count==2
    assert api.call_args.args[0][0]['inlineData']['mimeType']=='audio/wav'


def test_selected_range_uses_relative_attachment_and_absolute_source_cues(transcription):
    api,extractions=transcription
    api.side_effect=None; api.return_value=(segments(20),'test')
    result=asyncio.run(sub.generate_subtitles('source.mp4','key',start_time=30,end_time=50))
    assert extractions==[(30,50)]
    assert [(c['start'],c['end']) for c in result['lyrics']]==[(31,33)]


def test_failed_late_chunk_never_returns_partial_subtitles(transcription):
    api,_=transcription
    api.side_effect=[(segments(90),'test'),GeminiError('Quota exhausted',429)]
    with pytest.raises(GeminiError,match='Quota'):
        asyncio.run(sub.generate_subtitles('source.mp4','key'))
    assert api.call_count==2


def test_bad_timing_repaired_once_with_same_audio(transcription):
    api,_=transcription
    api.side_effect=[({'segments':[]},'test'),(segments(10),'test')]
    result=asyncio.run(sub.generate_subtitles('source.mp4','key',end_time=10))
    assert len(result['lyrics'])==1 and api.call_count==2
    assert api.call_args.args[0][0]['inlineData']['data']=='real-audio-mocked'


def test_no_vocals_is_explicit_not_fake_lyrics(transcription):
    api,_=transcription
    api.side_effect=None; api.return_value=({'language':'none','segments':[{'start':0,'end':10,'kind':'instrumental','original':'','english':'','romanized':''}]},'test')
    result=asyncio.run(sub.generate_subtitles('source.mp4','key',end_time=10))
    assert result['status']=='no_vocals' and result['lyrics']==[]


def test_missing_key_no_audio_invalid_range_fail_before_api(transcription,monkeypatch):
    api,_=transcription
    with pytest.raises(RuntimeError,match='API key'): asyncio.run(sub.generate_subtitles('source',''))
    for start,end in [(-1,10),(20,10),(0,101),(float('nan'),10)]:
        with pytest.raises(ValueError): asyncio.run(sub.generate_subtitles('source','key',start_time=start,end_time=end))
    monkeypatch.setattr(sub,'_probe_audio',lambda p: (_ for _ in ()).throw(RuntimeError('no audio track')))
    with pytest.raises(RuntimeError,match='no audio'): asyncio.run(sub.generate_subtitles('source','key'))
    api.assert_not_called()


def test_other_languages_keep_their_english_translation():
    result=sanitize_lyric_cues([{'start':0,'end':2,'text_jp':'मेरा नाम','text_en':'My name'}],0,2)
    assert result[0]['text_en']=='My name'


def moment(start=2,end=20):
    return {'start':start,'end':end,'payoff_time':10,'clip_type':'Chorus','reason':'The band builds and resolves.',
            'start_anchor':'A drum pickup','payoff_anchor':'Full band enters','end_anchor':'Vocal release'}


def test_song_analysis_audio_only_no_fake_scores_style_or_identification(monkeypatch):
    import app.ai.gemini_client as client
    monkeypatch.setattr(song,'probe_video',lambda p:SimpleNamespace(duration=40,has_audio=True))
    monkeypatch.setattr(client,'extract_timed_audio_samples',AsyncMock(return_value=[{'inlineData':{'data':'audio'}}]))
    api=AsyncMock(return_value=({'moments':[moment()]},'test'))
    monkeypatch.setattr(song,'generate_json',api)
    result=asyncio.run(song.analyze_song(video_path='source',api_key_override='key'))
    assert result['recommended_start']==2 and result['recommended_end']==20
    assert result['song_name']=='' and result['anime_name']=='' and result['score'] is None
    assert 'subtitle_style' not in result
    assert result['basis']=='audio_analysis'

@pytest.mark.parametrize('change',[{'start':-1},{'end':41},{'payoff_time':50},{'payoff_time':float('nan')},{'start_anchor':''},{'start':True}])
def test_song_moment_rejects_invalid_bounds_and_missing_audible_anchors(change):
    with pytest.raises(ValueError): song.validate_moments({'moments':[{**moment(),**change}]},40)


def test_ai_routes_surface_quota_and_missing_audio_as_actionable_status(monkeypatch):
    client=TestClient(main.app)
    for route,method,body in [('/api/ai/analyze','analyze_song',{}),('/api/ai/full-subtitles','generate_full_video_subtitles',{'video_path':'source'})]:
        monkeypatch.setattr(main.gemini_client,method,AsyncMock(side_effect=GeminiError('Quota reached; wait',429)))
        response=client.post(route,json=body)
        assert response.status_code==429 and 'Quota' in response.json()['detail']
