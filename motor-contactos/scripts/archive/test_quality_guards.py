import sys
sys.path.insert(0, 'c:/github/MejoraContactos/motor-contactos/src')
from motor.config import DedupConfig
from motor.dedup.scoring import RegistroParaScoring, calcular_score
from motor.text_cleaning import limpiar_nombre_persona, clasificar_identidad

# 1. Test dominios
assert limpiar_nombre_persona('ar') == '', f"Fallo ar: '{limpiar_nombre_persona('ar')}'"
assert limpiar_nombre_persona('com') == '', f"Fallo com: '{limpiar_nombre_persona('com')}'"
assert limpiar_nombre_persona('admin') == '', f"Fallo admin: '{limpiar_nombre_persona('admin')}'"
nom, ape, org, car = clasificar_identidad(None, 'ar', None, None)
assert ape == '', f"Fallo ape: '{ape}'"
print("Test 1 TLDs y palabras genericas OK!")

# 2. Test Maiten Ayala vs Mauricio Ayala sin telefono
cfg = DedupConfig()
a = RegistroParaScoring(1, 'Maiten', 'Ayala', None, frozenset(), frozenset())
b = RegistroParaScoring(2, 'Mauricio', 'Ayala', None, frozenset(), frozenset())
score, patron = calcular_score(a, b, cfg)
print(f"Maiten vs Mauricio: score={score}, patron={patron}")
assert score == 0.0, f"Score esperado 0.0 pero dio {score}"
print("Test 2 Conflicto de primer nombre OK!")

# 3. Test Ayala (solo apellido) vs Maiten Ayala sin telefono
c = RegistroParaScoring(3, None, 'Ayala', None, frozenset(), frozenset())
score_c, patron_c = calcular_score(c, a, cfg)
print(f"Solo apellido vs Nombre completo: score={score_c}, patron={patron_c}")
assert score_c < 0.50, f"Score esperado < 0.50 pero dio {score_c}"
print("Test 3 Solo apellido sin telefono no auto-fusiona OK!")
