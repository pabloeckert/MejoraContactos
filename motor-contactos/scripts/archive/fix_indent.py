with open(r'C:\github\MejoraContactos\motor-contactos\src\motor\text_cleaning.py', 'r', encoding='utf-8') as f:
    text = f.read()

bad = '''        s_norm = s.lower().strip().rstrip(".")
    if s_norm in _TLD_DOMINIOS_DESCARTAR or s_norm in _PALABRAS_GENERICAS_DESCARTAR:
        return ""
    if len(s.replace(".", "").strip()) <= 1:
        return ""'''

good = '''    s_norm = s.lower().strip().rstrip(".")
    if s_norm in _TLD_DOMINIOS_DESCARTAR or s_norm in _PALABRAS_GENERICAS_DESCARTAR:
        return ""
    if len(s.replace(".", "").strip()) <= 1:
        return ""'''

text = text.replace(bad, good)
with open(r'C:\github\MejoraContactos\motor-contactos\src\motor\text_cleaning.py', 'w', encoding='utf-8') as f:
    f.write(text)
print('Indentation corregida!')
