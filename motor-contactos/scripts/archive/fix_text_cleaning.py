with open(r'C:\github\MejoraContactos\motor-contactos\src\motor\text_cleaning.py', 'r', encoding='utf-8') as f:
    text = f.read()

# Asegurar listas de descarte
tld_block = '''
_TLD_DOMINIOS_DESCARTAR = {
    "ar", "com", "net", "org", "edu", "gov", "mil", "io", "co", "app", "dev",
    "me", "info", "biz", "tv", "online", "site", "xyz", "cloud", "ai", "tech",
}

_PALABRAS_GENERICAS_DESCARTAR = {
    "administrador", "administradora", "contacto", "contactos", "recepcion",
    "ventas", "soporte", "cliente", "clientes", "general", "prueba", "test",
    "sin nombre", "after office", "afteroffice", "desconocido", "null", "none",
    "informacion", "atencion", "casa", "oficina", "trabajo", "admin",
}
'''

if '_TLD_DOMINIOS_DESCARTAR' not in text:
    target = '_CONECTORES_MINUSCULA = {"de", "del", "la", "las", "los", "y", "el", "en"}'
    text = text.replace(target, target + '\n' + tld_block)

# Actualizar limpiar_nombre_persona
old_return = 'return _title_case(s)'
new_return = '''    s_norm = s.lower().strip().rstrip(".")
    if s_norm in _TLD_DOMINIOS_DESCARTAR or s_norm in _PALABRAS_GENERICAS_DESCARTAR:
        return ""
    if len(s.replace(".", "").strip()) <= 1:
        return ""

    return _title_case(s)'''

# Solo reemplazar el de limpiar_nombre_persona
idx_lnp = text.find('def limpiar_nombre_persona(')
idx_nc = text.find('def normalizar_cargo(')
if idx_lnp != -1 and idx_nc != -1:
    section = text[idx_lnp:idx_nc]
    if 's_norm in _TLD_DOMINIOS_DESCARTAR' not in section:
        section = section.replace(old_return, new_return)
        text = text[:idx_lnp] + section + text[idx_nc:]

# Actualizar clasificar_identidad
old_ci = '    # "Empresa"/"Cargo" a secas como valor literal es el placeholder que'
new_ci = '''    if nombre.lower().strip().rstrip(".") in _TLD_DOMINIOS_DESCARTAR or nombre.lower().strip().rstrip(".") in _PALABRAS_GENERICAS_DESCARTAR:
        nombre = ""
    if apellido.lower().strip().rstrip(".") in _TLD_DOMINIOS_DESCARTAR or apellido.lower().strip().rstrip(".") in _PALABRAS_GENERICAS_DESCARTAR:
        apellido = ""

    # "Empresa"/"Cargo" a secas como valor literal es el placeholder que'''

if 'in _TLD_DOMINIOS_DESCARTAR' not in text[text.find('def clasificar_identidad'):]:
    text = text.replace(old_ci, new_ci)

with open(r'C:\github\MejoraContactos\motor-contactos\src\motor\text_cleaning.py', 'w', encoding='utf-8') as f:
    f.write(text)

print('text_cleaning.py parcheado correctamente!')
