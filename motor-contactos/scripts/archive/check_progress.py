import sqlite3
conn = sqlite3.connect('Salida/staging.sqlite')
c = conn.cursor()
total_od = c.execute("SELECT count(*) FROM fuentes_procesadas WHERE ruta NOT LIKE 'google%'").fetchone()[0]
print(f"Total archivos locales/OneDrive procesados: {total_od}")
print("Ultimos 10 procesados:")
for r in c.execute("SELECT ruta, tamano_bytes, procesado_en FROM fuentes_procesadas WHERE ruta NOT LIKE 'google%' ORDER BY procesado_en DESC LIMIT 10"):
    print(" ", r)

print("\nRaw records agrupados por carpeta principal:")
for r in c.execute("""
    SELECT 
        CASE 
            WHEN source_file LIKE 'google:pablo%' THEN 'Google Pablo'
            WHEN source_file LIKE 'google:sindy%' THEN 'Google Sindy'
            ELSE substr(source_file, 1, 65)
        END,
        count(*)
    FROM raw_records
    GROUP BY 1
    ORDER BY count(*) DESC
    LIMIT 20
"""):
    print(" ", r)
