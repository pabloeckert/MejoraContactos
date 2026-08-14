const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, PageOrientation, VerticalAlign, Header, Footer, PageNumber,
} = require("docx");

// Paleta Mejora Continua
const AZUL = "1A3D84";
const ROJO = "E1061E";
const AMARILLO = "F7CC13";
const TINTA = "24282F";
const GRIS = "6B7280";
const BORDE = "E3E6EE";

// Fuente: Bw Modelica/League Spartan (las reales de marca) no se pueden
// embeber de forma confiable en un .docx portable entre PCs sin la
// fuente instalada -- se usa Segoe UI como reemplazo temporal (misma
// familia de geométrica neutra que indica el propio manual de marca
// como fallback cuando la fuente real no está disponible en el entorno).
const FUENTE = "Segoe UI";

function txt(texto, opciones = {}) {
  return new TextRun({ text: texto, font: FUENTE, ...opciones });
}

function parrafo(texto, opciones = {}) {
  const { spacingAfter = 120, ...resto } = opciones;
  return new Paragraph({
    children: [txt(texto, resto)],
    spacing: { after: spacingAfter },
  });
}

function titulo(texto, nivel = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: nivel,
    spacing: { before: 480, after: 200 },
    children: [new TextRun({ text: texto, font: FUENTE, bold: true, color: AZUL })],
  });
}

function eyebrow(texto) {
  return new Paragraph({
    spacing: { before: 400, after: 40 },
    children: [
      new TextRun({ text: texto.toUpperCase(), font: FUENTE, bold: true, size: 16, color: AZUL, characterSpacing: 20 }),
    ],
  });
}

function bullet(texto, color) {
  return new Paragraph({
    spacing: { after: 90 },
    indent: { left: 260 },
    children: [
      new TextRun({ text: (color === ROJO ? "✗  " : "✓  "), font: FUENTE, bold: true, color }),
      txt(texto, { size: 21 }),
    ],
  });
}

function celda(texto, opciones = {}) {
  const { bold = false, color = TINTA, shading = null, width, align = AlignmentType.LEFT, size = 20 } = opciones;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: shading ? { type: ShadingType.CLEAR, fill: shading } : undefined,
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [
      new Paragraph({
        alignment: align,
        children: [new TextRun({ text: texto, font: FUENTE, bold, color, size })],
      }),
    ],
  });
}

const ANCHO_TABLA = 9360; // A4 con márgenes de 1" a cada lado, en DXA

const doc = new Document({
  styles: {
    default: { document: { run: { font: FUENTE, size: 21, color: TINTA } } },
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "motor-contactos — ", font: FUENTE, size: 16, color: GRIS }),
                new TextRun({ children: [PageNumber.CURRENT], font: FUENTE, size: 16, color: GRIS }),
              ],
            }),
          ],
        }),
      },
      children: [
        // ---------- PORTADA ----------
        new Paragraph({ spacing: { before: 1600 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "MOTOR-CONTACTOS", font: FUENTE, bold: true, size: 22, color: AZUL, characterSpacing: 30 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 0 },
          children: [new TextRun({ text: "15 años de contactos desordenados.", font: FUENTE, bold: true, size: 56, color: TINTA })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 40 },
          children: [new TextRun({ text: "Resueltos en una noche.", font: FUENTE, bold: true, size: 56, color: ROJO })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 300, after: 700 },
          children: [
            new TextRun({
              text: "Ni WhatsApp podía encontrar tus contactos. Ahora hay una sola lista, limpia, y un sistema que la mantiene así.",
              font: FUENTE, size: 24, color: GRIS,
            }),
          ],
        }),
        new Table({
          alignment: AlignmentType.CENTER,
          width: { size: 7000, type: WidthType.DXA },
          columnWidths: [3000, 1000, 3000],
          borders: {
            top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 3000, type: WidthType.DXA },
                  children: [
                    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "36.103", font: FUENTE, bold: true, size: 52, color: TINTA })] }),
                    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "contactos crudos", font: FUENTE, size: 18, color: GRIS })] }),
                  ],
                }),
                new TableCell({
                  width: { size: 1000, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "→", font: FUENTE, size: 40, color: AMARILLO, bold: true })] })],
                }),
                new TableCell({
                  width: { size: 3000, type: WidthType.DXA },
                  children: [
                    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "8.541", font: FUENTE, bold: true, size: 52, color: AZUL })] }),
                    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "personas reales · 0 pendientes", font: FUENTE, size: 18, color: GRIS })] }),
                  ],
                }),
              ],
            }),
          ],
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ---------- EL PUNTO DE PARTIDA ----------
        eyebrow("El punto de partida"),
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: '"Campo nombre lleno de números de teléfono. Cargo y empresa mezclados. Dos WhatsApp amontonados en la misma celda con punto y coma. Caracteres raros por toda la planilla."',
              font: FUENTE, italics: true, size: 26, color: TINTA,
            }),
          ],
        }),
        new Paragraph({
          spacing: { after: 300 },
          children: [new TextRun({ text: "— cómo llegaron los datos, palabras del propio dueño de los contactos", font: FUENTE, size: 18, color: GRIS })],
        }),

        // ---------- ANTES / DESPUES ----------
        new Table({
          width: { size: ANCHO_TABLA, type: WidthType.DXA },
          columnWidths: [ANCHO_TABLA / 2, ANCHO_TABLA / 2],
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
            left: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
            right: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: ANCHO_TABLA / 2, type: WidthType.DXA },
                  margins: { top: 200, bottom: 200, left: 240, right: 240 },
                  children: [
                    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: "ANTES", font: FUENTE, bold: true, size: 18, color: GRIS, characterSpacing: 20 })] }),
                    bullet("Nombre con teléfono adentro, sin Título Case", ROJO),
                    bullet('Cargo con 3 roles concatenados con "/"', ROJO),
                    bullet("Dos WhatsApp juntos en una sola celda", ROJO),
                    bullet("Comillas, asteriscos, separadores sueltos", ROJO),
                    bullet("Un CSV que había que exportar a mano", ROJO),
                  ],
                }),
                new TableCell({
                  width: { size: ANCHO_TABLA / 2, type: WidthType.DXA },
                  margins: { top: 200, bottom: 200, left: 240, right: 240 },
                  children: [
                    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: "AHORA", font: FUENTE, bold: true, size: 18, color: AZUL, characterSpacing: 20 })] }),
                    bullet("Nombre y Apellido separados, en Título Case real", AZUL),
                    bullet("Un cargo, una empresa, un valor por campo", AZUL),
                    bullet("Un WhatsApp por fila — nunca dos amontonados", AZUL),
                    bullet("Cero caracteres sueltos en 8.541 contactos", AZUL),
                    bullet("Conectado en vivo a Google, se actualiza solo", AZUL),
                  ],
                }),
              ],
            }),
          ],
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ---------- COMO FUNCIONA ----------
        eyebrow("Cómo funciona"),
        titulo("Una IA que decide sola, salvo cuando no debe."),
        parrafo("1. Trae — Se conecta directo a las dos cuentas de Google. También lee CSV de HubSpot, Mailchimp, Brevo, PDFs, capturas y Word.", { spacingAfter: 200 }),
        parrafo("2. Limpia — Separa nombre de cargo de empresa, saca caracteres sueltos, corrige mayúsculas — calibrado contra los datos reales, no adivinado.", { spacingAfter: 200 }),
        parrafo("3. Decide — Mismo teléfono exacto: fusiona sola. Nada en común: separa sola. Casos dudosos: los resuelve una IA — y si dos personas distintas comparten una línea familiar, nunca las mezcla en silencio.", { spacingAfter: 200 }),
        parrafo("4. Aprende — Cada corrección humana ajusta el criterio para el próximo caso parecido. Y avisa solo si un teléfono aparece en demasiados contactos distintos.", { spacingAfter: 200 }),

        // ---------- INTERFAZ ----------
        eyebrow("La interfaz"),
        titulo("Una app de verdad. Doble clic, y listo."),
        parrafo("Ventana propia, sin terminal, sin pestaña de navegador — con la identidad visual de Mejora Continua. Tabla completa con 12 columnas configurables y redimensionables, filtro combinado por columna y búsqueda global instantánea sobre los 8.541 contactos.", { spacingAfter: 300 }),

        // ---------- INTEGRACIONES ----------
        eyebrow("Integraciones"),
        titulo("Se conecta con lo que ya usás."),
        new Table({
          width: { size: ANCHO_TABLA, type: WidthType.DXA },
          columnWidths: [2800, 4760, 1800],
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
            left: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
            right: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
            insideVertical: { style: BorderStyle.SINGLE, size: 4, color: BORDE },
          },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                celda("Integración", { bold: true, color: "FFFFFF", shading: AZUL, width: 2800 }),
                celda("Qué hace", { bold: true, color: "FFFFFF", shading: AZUL, width: 4760 }),
                celda("Estado", { bold: true, color: "FFFFFF", shading: AZUL, width: 1800, align: AlignmentType.CENTER }),
              ],
            }),
            new TableRow({ children: [
              celda("Google Contacts", { bold: true, width: 2800 }),
              celda("Import en vivo de las dos cuentas. Sync de vuelta, lista para activar.", { width: 4760 }),
              celda("En vivo", { color: AZUL, bold: true, width: 1800, align: AlignmentType.CENTER }),
            ]}),
            new TableRow({ children: [
              celda("HubSpot / Mailchimp / Brevo", { bold: true, width: 2800 }),
              celda("Reconoce sus formatos de exportación automáticamente.", { width: 4760 }),
              celda("En vivo", { color: AZUL, bold: true, width: 1800, align: AlignmentType.CENTER }),
            ]}),
            new TableRow({ children: [
              celda("MejoraWS", { bold: true, width: 2800 }),
              celda("Exporta la lista lista para mandar el primer WhatsApp.", { width: 4760 }),
              celda("En vivo", { color: AZUL, bold: true, width: 1800, align: AlignmentType.CENTER }),
            ]}),
            new TableRow({ children: [
              celda("Gmail", { bold: true, width: 2800 }),
              celda("Rescata gente con la que hubo mail pero nunca se guardó.", { width: 4760 }),
              celda("Falta un login", { color: GRIS, bold: true, width: 1800, align: AlignmentType.CENTER, size: 17 }),
            ]}),
            new TableRow({ children: [
              celda("PDF / capturas / Word", { bold: true, width: 2800 }),
              celda("Extrae contactos de archivos sueltos, texto libre incluido.", { width: 4760 }),
              celda("En vivo", { color: AZUL, bold: true, width: 1800, align: AlignmentType.CENTER }),
            ]}),
            new TableRow({ children: [
              celda("Aviso mensual", { bold: true, width: 2800 }),
              celda("El día 30, se actualiza sola y avisa el resumen.", { width: 4760 }),
              celda("En vivo", { color: AZUL, bold: true, width: 1800, align: AlignmentType.CENTER }),
            ]}),
          ],
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ---------- PRUEBA ----------
        eyebrow("Antes de mostrarlo"),
        titulo("Probado contra los datos de verdad, no una demo."),
        new Table({
          width: { size: ANCHO_TABLA, type: WidthType.DXA },
          columnWidths: [ANCHO_TABLA / 3, ANCHO_TABLA / 3, ANCHO_TABLA / 3],
          borders: {
            top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: ANCHO_TABLA / 3, type: WidthType.DXA },
                  children: [
                    new Paragraph({ children: [new TextRun({ text: "195", font: FUENTE, bold: true, size: 44, color: AZUL })] }),
                    new Paragraph({ children: [new TextRun({ text: "tests automáticos, todos en verde", font: FUENTE, size: 18, color: GRIS })] }),
                  ],
                }),
                new TableCell({
                  width: { size: ANCHO_TABLA / 3, type: WidthType.DXA },
                  children: [
                    new Paragraph({ children: [new TextRun({ text: "6", font: FUENTE, bold: true, size: 44, color: AZUL })] }),
                    new Paragraph({ children: [new TextRun({ text: "bugs reales encontrados y corregidos", font: FUENTE, size: 18, color: GRIS })] }),
                  ],
                }),
                new TableCell({
                  width: { size: ANCHO_TABLA / 3, type: WidthType.DXA },
                  children: [
                    new Paragraph({ children: [new TextRun({ text: "0", font: FUENTE, bold: true, size: 44, color: AZUL })] }),
                    new Paragraph({ children: [new TextRun({ text: "contactos perdidos o fusionados por error", font: FUENTE, size: 18, color: GRIS })] }),
                  ],
                }),
              ],
            }),
          ],
        }),

        // ---------- CIERRE ----------
        new Paragraph({ spacing: { before: 700 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Un sistema que se mantiene solo. Un dato, un lugar.", font: FUENTE, bold: true, size: 32, color: TINTA })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 160, after: 300 },
          children: [new TextRun({ text: "Todo corre local. Nada de esto sale de la PC salvo la conexión directa a Google.", font: FUENTE, size: 20, color: GRIS })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "2", font: FUENTE, bold: true, size: 24, color: ROJO }),
            new TextRun({ text: " pasos, y no son técnicos — son 2 logins de Google, tuyos.", font: FUENTE, size: 20, color: TINTA }),
          ],
        }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  require("fs").writeFileSync("motor-contactos-informe.docx", buffer);
  console.log("listo");
});
