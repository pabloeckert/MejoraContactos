with open(r'C:\github\MejoraContactos\motor-contactos\src\motor\dedup\scoring.py', 'r', encoding='utf-8') as f:
    content = f.read()

old_fn = '''def _primeros_nombres_compatibles(nom_a: str | None, nom_b: str | None) -> bool:
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
    return fuzz.ratio(a, b) >= 65.0'''

new_fn = '''def _primeros_nombres_compatibles(nom_a: str | None, nom_b: str | None) -> bool:
    """Verifica si los nombres de pila son compatibles (no contradictorios)."""
    if not nom_a or not nom_b:
        return True
    a = nom_a.strip().lower()
    b = nom_b.strip().lower()
    if not a or not b or a == b:
        return True
    # Iniciales (ej. 'J' para 'Juan', 'M' para 'Maria')
    if (len(a) == 1 and b.startswith(a)) or (len(b) == 1 and a.startswith(b)):
        return True
    # Prefijos o nombres compuestos
    if a.startswith(b) or b.startswith(a):
        return True
    tokens_a = set(a.split())
    tokens_b = set(b.split())
    if tokens_a & tokens_b:
        return True
    # Diminutivos o typos cercanos
    return fuzz.ratio(a, b) >= 65.0'''

content = content.replace(old_fn, new_fn)
with open(r'C:\github\MejoraContactos\motor-contactos\src\motor\dedup\scoring.py', 'w', encoding='utf-8') as f:
    f.write(content)
print('scoring.py actualizado con exito!')
