"""Script para aplicar mejoras de calidad en text_cleaning.py, scoring.py y universal_scanner.py"""
import re

# 1. Actualizar text_cleaning.py
with open(r'C:\github\MejoraContactos\motor-contactos\src\motor\text_cleaning.py', 'r', encoding='utf-8') as f:
    tc_content = f.read()

# Definir listas de descarte si no están presentes
tld_def = '''
_TLD_DOMINIOS_DESCARTAR = {
    "ar", "com", "net", "org", "edu", "gov", "mil", "io", "co", "app", "dev",
    "me", "info", "biz", "tv", "online", "site", "xyz", "cloud", "ai", "tech",
}

_PALABRAS_GENERICAS_DESCARTAR = {
    "administrador", "administradora", "contacto", "contactos", "recepcion",
    "ventas", "soporte", "cliente", "clientes", "general", "prueba", "test",
    "sin nombre", "after office", "afteroffice", "desconocido", "null", "none",
    "informacion", "atencion", "casa", "oficina", "trabajo",
}
'''

if '_TLD_DOMINIOS_DESCARTAR' not in tc_content:
    # Insertar después de _HONORIFICOS
    tc_content = tc_content.replace(
        '_CONECTORES_MINUSCULA = {"de", "del", "la", "las", "los", "y", "el", "en"}',
        '_CONECTORES_MINUSCULA = {"de", "del", "la", "las", "los", "y", "el", "en"}\n' + tld_def
    )

# En limpiar_nombre_persona, agregar comprobación de TLDs y palabras genéricas
old_limpiar_check = '''    if not _TIENE_LETRA_RE.search(s):
        # Caso real: "*" o "**" sueltos como nombre - sin una sola letra
        # adentro, no puede ser un nombre de persona.
        return ""'''

new_limpiar_check = '''    if not _TIENE_LETRA_RE.search(s):
        # Caso real: "*" o "**" sueltos como nombre - sin una sola letra
        # adentro, no puede ser un nombre de persona.
        return ""

    s_norm = s.lower().strip().rstrip(".")
    if s_norm in _TLD_DOMINIOS_DESCARTAR or s_norm in _PALABRAS_GENERICAS_DESCARTAR:
        return ""

    if len(s.replace(".", "").strip()) <= 1:
        return ""'''

if old_limpiar_check in tc_content:
    tc_content = tc_content.replace(old_limpiar_check, new_limpiar_check)

# En clasificar_identidad, filtrar TLDs y palabras genéricas en nombre y apellido
old_clasificar = '''    # "Empresa"/"Cargo" a secas como valor literal es el placeholder que'''
new_clasificar = '''    if nombre.lower().strip().rstrip(".") in _TLD_DOMINIOS_DESCARTAR or nombre.lower().strip().rstrip(".") in _PALABRAS_GENERICAS_DESCARTAR:
        nombre = ""
    if apellido.lower().strip().rstrip(".") in _TLD_DOMINIOS_DESCARTAR or apellido.lower().strip().rstrip(".") in _PALABRAS_GENERICAS_DESCARTAR:
        apellido = ""

    # "Empresa"/"Cargo" a secas como valor literal es el placeholder que'''

if old_clasificar in tc_content and 'in _TLD_DOMINIOS_DESCARTAR' not in tc_content.split('def clasificar_identidad')[1]:
    tc_content = tc_content.replace(old_clasificar, new_clasificar, 1)

with open(r'C:\github\MejoraContactos\motor-contactos\src\motor\text_cleaning.py', 'w', encoding='utf-8') as f:
    f.write(tc_content)

print('text_cleaning.py actualizado con éxito!')


# 2. Actualizar scoring.py
with open(r'C:\github\MejoraContactos\motor-contactos\src\motor\dedup\scoring.py', 'r', encoding='utf-8') as f:
    sc_content = f.read()

# Reemplazar calcular_score y funciones auxiliares para evitar over-clustering
scoring_code_nuevo = '''def _primeros_nombres_compatibles(nom_a: str | None, nom_b: str | None) -> bool:
    """Verifica si los nombres de pila son compatibles (no contradictorios)."""
    if not nom_a or not nom_b:
        return True
    a = nom_a.strip().lower()
    b = nom_b.strip().lower()
    if a == b:
        return True
    # Si uno es prefijo o token del otro (ej. 'Juan' en 'Juan Pablo', 'Maria' en 'Maria Graciela')
    tokens_a = set(a.split())
    tokens_b = set(b.split())
    if tokens_a & tokens_b:
        return True
    # Diminutivos o typos cercanos
    return fuzz.ratio(a, b) >= 65.0


def calcular_score(
    a: RegistroParaScoring, b: RegistroParaScoring, config: DedupConfig
) -> tuple[float, str]:
    """Devuelve (score, patron). El patrón identifica qué señales
    coincidieron (ver _bucket) y es la clave que usa dedup/learning.py para
    ajustar el score de casos futuros con el mismo patrón."""
    telefono_exacto = bool(a.telefonos & b.telefonos)
    email_exacto = bool(a.emails & b.emails)
    nombre_sim = _similitud_nombre(a, b)
    organizacion_sim = _similitud_organizacion(a, b)

    score = (
        config.pesos.telefono_exacto * telefono_exacto
        + config.pesos.email_exacto * email_exacto
        + config.pesos.nombre_similitud * nombre_sim
        + config.pesos.organizacion * organizacion_sim
    )

    # Salvaguardas estrictas anti falsos positivos y anti over-clustering
    nombres_compatibles = _primeros_nombres_compatibles(a.nombre, b.nombre)
    nombres_claramente_distintos = (
        (_ambos_con_nombre(a, b) and nombre_sim < _UMBRAL_NOMBRE_CLARAMENTE_DISTINTO)
        or not nombres_compatibles
    )

    # Si NO tienen teléfono NI email en común:
    if not telefono_exacto and not email_exacto:
        # Si los nombres de pila chocan abiertamente (ej. 'Maitén Ayala' vs 'Mauricio Ayala')
        if not nombres_compatibles:
            score = 0.0
        else:
            # Solo permitir auto-fusión (1.0) si AMBOS tienen nombre y apellido completos y coinciden
            ambos_completos = bool(a.nombre and a.apellido and b.nombre and b.apellido)
            if ambos_completos and nombre_sim >= 0.85:
                score = 1.0
            elif not ambos_completos and nombre_sim >= 0.80:
                # Nombre incompleto (solo apellido o solo nombre) sin teléfono/email NO puede auto-fusionar
                score = min(score, 0.45)
    else:
        # Tienen teléfono o email en común
        if not nombres_claramente_distintos:
            score = 1.0

    patron = (
        f"tel={'si' if telefono_exacto else 'no'}"
        f"|mail={'si' if email_exacto else 'no'}"
        f"|nombre={_bucket(nombre_sim)}"
        f"{'|nombres_distintos' if nombres_claramente_distintos else ''}"
    )
    return min(score, 1.0), patron
'''

# Localizar calcular_score y reemplazar
idx_start = sc_content.find('def calcular_score(')
idx_end = sc_content.find('def _ambos_con_nombre(')
if idx_start != -1 and idx_end != -1:
    sc_content = sc_content[:idx_start] + scoring_code_nuevo + '\n\n' + sc_content[idx_end:]
    with open(r'C:\github\MejoraContactos\motor-contactos\src\motor\dedup\scoring.py', 'w', encoding='utf-8') as f:
        f.write(sc_content)
    print('scoring.py actualizado con éxito!')
else:
    print('No se pudo ubicar calcular_score en scoring.py')


# 3. Actualizar universal_scanner.py para filtrar filas y planillas no-contacto
with open(r'C:\github\MejoraContactos\motor-contactos\src\motor\extractors\universal_scanner.py', 'r', encoding='utf-8') as f:
    us_content = f.read()

# En _extraer_delimitado, exigir al menos un campo canónico de contacto
old_delim_check = '''        if campos or dinamicos:
            if dinamicos:
                campos["atributos_dinamicos"] = json.dumps(dinamicos, ensure_ascii=False)
            registros.append(RawContactRecord(str(path), i, campos, confianza_extraccion="alta"))'''

new_delim_check = '''        tiene_senal_contacto = any(k in campos for k in ("nombre", "nombre_completo", "apellido", "telefono_1", "email_1", "organizacion"))
        if tiene_senal_contacto:
            if dinamicos:
                campos["atributos_dinamicos"] = json.dumps(dinamicos, ensure_ascii=False)
            registros.append(RawContactRecord(str(path), i, campos, confianza_extraccion="alta"))'''

if old_delim_check in us_content:
    us_content = us_content.replace(old_delim_check, new_delim_check)

# En _extraer_planilla_elastica, descartar hojas sin ninguna columna de contacto
old_plan_check = '''        encabezados = [str(c).strip() for c in df.columns]
        mapa = mapear_columnas(encabezados)'''

new_plan_check = '''        encabezados = [str(c).strip() for c in df.columns]
        mapa = mapear_columnas(encabezados)
        columnas_contacto = [c for c in df.columns if mapa.get(str(c).strip()) in ("nombre", "nombre_completo", "apellido", "telefono_1", "email_1", "organizacion")]
        if not columnas_contacto:
            # Hoja puramente contable/financiera o sin datos de contacto
            continue'''

if old_plan_check in us_content:
    us_content = us_content.replace(old_plan_check, new_plan_check)

old_plan_row = '''            if campos or dinamicos:
                if dinamicos:
                    campos["atributos_dinamicos"] = json.dumps(dinamicos, ensure_ascii=False)
                row_num = int(idx) + 2
                fuente = f"{path}#{nombre_hoja}"
                registros.append(RawContactRecord(fuente, row_num, campos, confianza_extraccion="alta"))'''

new_plan_row = '''            tiene_senal_contacto = any(k in campos for k in ("nombre", "nombre_completo", "apellido", "telefono_1", "email_1", "organizacion"))
            if tiene_senal_contacto:
                if dinamicos:
                    campos["atributos_dinamicos"] = json.dumps(dinamicos, ensure_ascii=False)
                row_num = int(idx) + 2
                fuente = f"{path}#{nombre_hoja}"
                registros.append(RawContactRecord(fuente, row_num, campos, confianza_extraccion="alta"))'''

if old_plan_row in us_content:
    us_content = us_content.replace(old_plan_row, new_plan_row)

with open(r'C:\github\MejoraContactos\motor-contactos\src\motor\extractors\universal_scanner.py', 'w', encoding='utf-8') as f:
    f.write(us_content)

print('universal_scanner.py actualizado con éxito!')
