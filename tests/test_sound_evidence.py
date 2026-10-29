from pathlib import Path
from unittest.mock import patch

from videolens.managed import Connection, ManagedClient
from videolens.processors.analyze_sounds import analyze_sounds
from videolens.types import TimelineSegment


def test_sound_chunks_preserve_global_offsets_and_remove_temporary_audio(tmp_path):
    client = ManagedClient(Connection('fixture', 'fixture', 'fixture'), 'report', sound_consent=True)
    def make_wav(args, **kwargs):
        Path(args[-1]).write_bytes(b'bounded-wav')
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
