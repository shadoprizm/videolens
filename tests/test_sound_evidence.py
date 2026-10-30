from pathlib import Path
from unittest.mock import patch

from videolens.managed import Connection, ManagedClient
from videolens.processors.analyze_sounds import analyze_sounds
from videolens.types import TimelineSegment


def test_sound_chunks_preserve_global_offsets_and_remove_temporary_audio(tmp_path):
    client = ManagedClient(Connection('fixture', 'fixture', 'fixture'), 'report', sound_consent=True)
    def make_wav(args, **kwargs):
        import wave
        with wave.open(str(args[-1]), 'wb') as audio:
            audio.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
            audio.writeframes(b'\x01\x00' * (61 * 16000))
    with patch('videolens.processors.analyze_sounds.subprocess.run', side_effect=make_wav), patch.object(client, 'analyze_sounds', side_effect=[{'windows':[{'start':3,'end':4,'description':'A tone','confidence':'medium'}]},{'windows':[{'start':0.25,'end':0.75,'description':'A tone','confidence':'medium'}]}]):
        segments, limits = analyze_sounds(tmp_path / 'video.webm', 61, tmp_path / 'sound', client)
    assert [(s.start,s.end) for s in segments] == [(3,4),(60.25,60.75)]
    assert all(s.transcript is None and s.visual_summary is None and s.audio_summary == 'A tone' for s in segments)
    assert not list((tmp_path / 'sound').glob('*.wav'))
    assert any('coverage' in s for s in limits)


def test_old_consent_and_private_keys_do_not_send_audio_to_a_new_provider(tmp_path):
    with patch('videolens.processors.analyze_sounds.subprocess.run') as run:
        for client in [None, ManagedClient(Connection('x','x','x'),'report',multimodel=True)]:
            segments, limits = analyze_sounds(tmp_path / 'video', 10, tmp_path, client)
            assert not segments and 'not analyzed' in limits[0]
        run.assert_not_called()


def test_real_opus_audio_keeps_the_beginning_and_decoded_duration(tmp_path):
    import io
    import struct
    import subprocess
    import wave
    video = tmp_path / 'original.webm'
    subprocess.run([
        'ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
        'sine=frequency=1000:sample_rate=16000:duration=0.2,apad=whole_dur=3',
        '-c:a', 'libopus', str(video),
    ], check=True, capture_output=True)
    client = ManagedClient(Connection('fixture','fixture','fixture'),'report',sound_consent=True)
    captured = []
    def hear(payload):
        with wave.open(io.BytesIO(payload), 'rb') as audio:
            duration = audio.getnframes() / audio.getframerate()
            pcm = audio.readframes(audio.getnframes())
            beginning = struct.unpack('<160h',pcm[:320])
            ending = struct.unpack('<160h',pcm[-320:])
            captured.append((duration,max(abs(sample) for sample in beginning),max(abs(sample) for sample in ending)))
        return {'windows':[{'start':0,'end':duration,'description':'A steady tone.','confidence':'medium'}]}
    with patch.object(client,'analyze_sounds',side_effect=hear):
        segments, _ = analyze_sounds(video,3,tmp_path/'sound',client)
    assert len(captured) == 1
    assert 2.98 <= captured[0][0] <= 3.01  # within one 20ms Opus packet
    assert captured[0][1] > 1000
    assert captured[0][2] < 20
    assert segments[0].start == 0 and abs(segments[0].end-3) < .02
    assert not list((tmp_path/'sound').glob('*.wav'))


def test_failed_provider_also_removes_the_complete_decoded_audio(tmp_path):
    import wave
    import pytest
    client = ManagedClient(Connection('fixture','fixture','fixture'),'report',sound_consent=True)
    def decoded(args, **kwargs):
        with wave.open(str(args[-1]),'wb') as audio:
            audio.setparams((1,2,16000,0,'NONE','not compressed'))
            audio.writeframes(b'\x01\x00'*16000)
    with patch('videolens.processors.analyze_sounds.subprocess.run',side_effect=decoded), patch.object(client,'analyze_sounds',side_effect=RuntimeError('provider failed')):
        with pytest.raises(RuntimeError,match='provider failed'):
            analyze_sounds(tmp_path/'video.webm',1,tmp_path/'sound',client)
    assert not list((tmp_path/'sound').glob('*.wav'))
