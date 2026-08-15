"""Tabla de códigos de área (característica) de Argentina.

El plan de numeración argentino reserva bloques de longitud fija por región:
2 dígitos para AMBA, un conjunto de ciudades grandes con 3 dígitos, y el
resto del país (mayoría geográfica, pueblos y ciudades chicas) con 4 dígitos.

Esta tabla NO es exhaustiva para el bloque de 3 dígitos: cubre las capitales
de provincia y las ciudades más grandes, que concentran la enorme mayoría de
los contactos reales. Cualquier prefijo que no matchea ninguna de las dos
tablas de abajo se asume de 4 dígitos, que es el comportamiento correcto por
default (son la mayoría numérica de los códigos del país).

Si en el uso real aparece un número mal separado por un código de 3 dígitos
faltante en esta lista, agregalo acá — es el único lugar que hay que tocar.
"""

# Único código de 2 dígitos: Capital Federal + Gran Buenos Aires.
AREA_CODES_2 = frozenset({"11"})

# Códigos de 3 dígitos: capitales de provincia y grandes ciudades.
AREA_CODES_3 = frozenset(
    {
        "220",  # San Nicolás de los Arroyos
        "221",  # La Plata
        "223",  # Mar del Plata
        "230",  # Chivilcoy
        "233",  # Pergamino
        "236",  # Bragado
        "237",  # Junín (BA)
        "260",  # San Rafael (Mendoza)
        "261",  # Mendoza capital
        "264",  # San Juan capital
        "266",  # San Luis capital
        "280",  # Puerto Madryn
        "283",  # Viedma
        "291",  # Bahía Blanca
        "294",  # San Carlos de Bariloche
        "297",  # Comodoro Rivadavia
        "299",  # Neuquén capital
        "336",  # Concordia (Entre Ríos)
        "341",  # Rosario (Santa Fe)
        "342",  # Santa Fe capital
        "343",  # Paraná (Entre Ríos)
        "345",  # Gualeguaychú
        "351",  # Córdoba capital
        "353",  # Río Cuarto
        "358",  # Villa María
        "362",  # Resistencia (Chaco)
        "370",  # Formosa capital
        "376",  # Posadas (Misiones)
        "379",  # Corrientes capital
        "380",  # La Rioja capital
        "381",  # San Miguel de Tucumán
        "383",  # Catamarca capital
        "385",  # Santiago del Estero capital
        "387",  # Salta capital
        "388",  # San Salvador de Jujuy
    }
)


def area_code_len(prefix_2: str, prefix_3: str) -> int:
    """Determina la longitud del código de área para un par de prefijos candidatos.

    prefix_2 y prefix_3 son los primeros 2 y 3 dígitos de un número ya sin el
    0 de larga distancia. Devuelve 2, 3 o 4 (4 = default/fallback).
    """
    if prefix_2 in AREA_CODES_2:
        return 2
    if prefix_3 in AREA_CODES_3:
        return 3
    return 4
