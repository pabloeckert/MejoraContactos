from unittest.mock import patch

import pytest

from motor.mejoraws_launcher import MejoraWsNoEncontradoError, abrir_mejoraws


def test_abrir_mejoraws_lanza_el_bat_si_existe(tmp_path):
    (tmp_path / "Iniciar MejoraContacto.bat").write_text("@echo off\n", encoding="utf-8")

    with patch("motor.mejoraws_launcher.subprocess.Popen") as mock_popen:
        abrir_mejoraws(tmp_path)

    mock_popen.assert_called_once()
    args, kwargs = mock_popen.call_args
    comando = args[0]
    assert comando[:3] == ["cmd.exe", "/c", "start"]
    assert str(tmp_path / "Iniciar MejoraContacto.bat") in comando
    assert kwargs["cwd"] == str(tmp_path)


def test_abrir_mejoraws_sin_el_bat_levanta_error_claro(tmp_path):
    carpeta_vacia = tmp_path / "no-existe-mejoraws"

    with pytest.raises(MejoraWsNoEncontradoError, match="Iniciar MejoraContacto.bat"):
        abrir_mejoraws(carpeta_vacia)
