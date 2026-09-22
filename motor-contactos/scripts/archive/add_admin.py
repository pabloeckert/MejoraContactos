with open(r'C:\github\MejoraContactos\motor-contactos\src\motor\text_cleaning.py', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(
    '"administrador", "administradora"',
    '"admin", "administracion", "administrador", "administradora"'
)

with open(r'C:\github\MejoraContactos\motor-contactos\src\motor\text_cleaning.py', 'w', encoding='utf-8') as f:
    f.write(text)
print('admin agregado a genericas!')
