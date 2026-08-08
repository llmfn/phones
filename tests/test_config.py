import pytest

from phonekit import config
from phonekit.app import Application


def run_check(monkeypatch, capsys, settings_path):
    monkeypatch.setattr(config, "SETTINGS_PATH", settings_path)
    monkeypatch.setattr("sys.argv", ["app.py", "--check"])

    with pytest.raises(SystemExit) as exit_info:
        Application().run()

    return exit_info.value.code, capsys.readouterr()


def test_check_fails_when_settings_file_is_missing(monkeypatch, capsys, tmp_path):
    code, output = run_check(monkeypatch, capsys, tmp_path / "settings.py")

    assert code == 1
    assert "settings.py is missing" in output.err


@pytest.mark.parametrize("key", ["", "   ", "sk-proj-..."])
def test_check_fails_when_api_key_is_not_set(monkeypatch, capsys, tmp_path, key):
    settings_path = tmp_path / "settings.py"
    settings_path.write_text(f"OPENAI_API_KEY = {key!r}\n")

    code, output = run_check(monkeypatch, capsys, settings_path)

    assert code == 1
    assert "OPENAI_API_KEY is not set" in output.err


def test_check_passes_when_api_key_is_set(monkeypatch, capsys, tmp_path):
    settings_path = tmp_path / "settings.py"
    settings_path.write_text("OPENAI_API_KEY = 'sk-test-key'\n")

    code, output = run_check(monkeypatch, capsys, settings_path)

    assert code == 0
    assert "Setup check passed" in output.out
