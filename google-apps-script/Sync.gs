/**
 * Sincroniza la lista maestra de motor-contactos (Google Sheet compartido,
 * importado directo desde Data/Salida/lista-maestra.xlsx) con Google
 * Contacts de ESTA cuenta.
 *
 * Cada cuenta (Pablo, Sindy) corre su PROPIA copia de este script,
 * autorizada con su propio login — así cada una escribe en SU PROPIA
 * agenda de contactos, no en una compartida. Es la decisión ya tomada en
 * Data/decisiones-arquitectura.txt: "Apps Script gratis, cada cuenta con
 * su propio trigger contra un Sheet compartido".
 *
 * Usa el servicio avanzado "People API" (hay que habilitarlo una vez por
 * cuenta, ver más abajo). La versión anterior de este script usaba
 * ContactsApp, el servicio nativo legacy de Apps Script — Google lo
 * deprecó el 16/12/2022 y lo DIO DE BAJA el 31/01/2025, así que ya no
 * funciona. La People API es el reemplazo directo que documenta Google
 * (https://developers.google.com/apps-script/migration/contacts-people).
 * El permiso ya otorgado con el scope legacy (google.com/m8/feeds) sigue
 * siendo válido como alias de contacts, así que no hace falta repetir
 * ninguna autorización previa — solo habilitar el servicio nuevo.
 *
 * CÓMO USAR (una vez por cuenta — Pablo y Sindy hacen esto cada uno en la
 * suya):
 * 1. Generá la lista maestra: panel web (`python -m motor.cli panel`,
 *    botón "Exportar a Excel") o `python -m motor.cli exportar`.
 * 2. Creá un Google Sheet nuevo (o abrí el compartido si ya existe) y
 *    hacé Archivo > Importar > Subir > Data/Salida/lista-maestra.xlsx >
 *    "Reemplazar hoja actual". La pestaña tiene que quedar llamada
 *    "Lista maestra" (así sale del export, no hace falta renombrar).
 * 3. Compartí ese Sheet con la otra cuenta (Editor).
 * 4. Extensiones > Apps Script. Pegá este archivo completo. Guardá.
 * 5. Servicios (ícono "+" en el panel izquierdo) > buscá "People API" >
 *    Agregar. Sin este paso el script no compila (People no existe).
 * 6. Corré sincronizarContactos() una vez a mano (▶) para autorizar los
 *    permisos que pide Google. Si aparece "Google no verificó esta app",
 *    es tu propio script — Avanzado > Ir a [nombre del proyecto].
 *    IMPORTANTE: probá esto primero contra un Sheet de prueba con 2-3
 *    contactos ficticios, no contra la lista real, hasta confirmar que
 *    la migración a People API anda bien en tu cuenta.
 * 7. (Opcional, recomendado) Activá un disparador automático: ícono de
 *    reloj a la izquierda > Añadir disparador > función
 *    sincronizarContactos > Basado en tiempo > cada día, a la hora que
 *    prefieras.
 *
 * Es idempotente: correrlo de nuevo actualiza los contactos ya creados
 * (columna "Google Contact ID") en vez de duplicarlos. Si Google devuelve
 * error de cuota (429), reintenta solo esa fila con espera creciente
 * (2s, 4s, 8s, 16s) antes de darse por vencido.
 */

var NOMBRE_HOJA = "Lista maestra";
var COLUMNAS = {
  nombre: "Nombre",
  apellido: "Apellido",
  cargo: "Cargo",
  empresa: "Empresa",
  whatsapp: "WhatsApp",
  telefonoFijo: "Teléfono fijo",
  email: "Email",
  domicilio: "Domicilio",
  ciudad: "Ciudad",
  provincia: "Provincia",
  pais: "País",
  notaReferencia: "Nota de referencia",
  idGoogle: "Google Contact ID",
  ultimaSync: "Última sincronización",
};

var CAMPOS_PERSONA = "names,phoneNumbers,emailAddresses,organizations,addresses,biographies";

function sincronizarContactos() {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOMBRE_HOJA);
  if (!hoja) {
    throw new Error('No se encontró la hoja "' + NOMBRE_HOJA + '". Revisá el nombre de la pestaña.');
  }

  var datos = hoja.getDataRange().getValues();
  var encabezados = datos[0];
  var idx = {};
  encabezados.forEach(function (h, i) {
    idx[h] = i;
  });

  idx = asegurarColumnas_(hoja, encabezados, idx);

  var creados = 0;
  var actualizados = 0;
  var saltados = 0;

  for (var fila = 1; fila < datos.length; fila++) {
    var valores = datos[fila];
    var nombre = valores[idx[COLUMNAS.nombre]];
    var apellido = valores[idx[COLUMNAS.apellido]];
    var email = valores[idx[COLUMNAS.email]];
    var whatsapp = valores[idx[COLUMNAS.whatsapp]];

    if (!nombre && !apellido && !email && !whatsapp) {
      saltados++;
      continue; // fila sin nada útil para crear un contacto
    }

    try {
      var idExistente = valores[idx[COLUMNAS.idGoogle]];
      var idFinal;
      if (idExistente) {
        idFinal = actualizarContacto_(idExistente, valores, idx);
        actualizados++;
      } else {
        idFinal = crearContacto_(valores, idx);
        creados++;
      }
      hoja.getRange(fila + 1, idx[COLUMNAS.idGoogle] + 1).setValue(idFinal);
      hoja.getRange(fila + 1, idx[COLUMNAS.ultimaSync] + 1).setValue(new Date());
    } catch (err) {
      Logger.log("Fila " + (fila + 1) + " (" + nombre + " " + apellido + "): " + err);
    }
  }

  Logger.log("Creados: " + creados + " | Actualizados: " + actualizados + " | Saltados (sin datos): " + saltados);
}

function crearContacto_(valores, idx) {
  var persona = construirPersona_(valores, idx);
  var creado = conReintento_(function () {
    return People.People.createContact(persona);
  });
  return creado.resourceName;
}

function actualizarContacto_(resourceName, valores, idx) {
  var actual;
  try {
    actual = conReintento_(function () {
      return People.People.get(resourceName, { personFields: "metadata" });
    });
  } catch (err) {
    // El contacto se borró en Google Contacts desde la última sync (404)
    // — se crea de nuevo en vez de fallar.
    return crearContacto_(valores, idx);
  }

  var persona = construirPersona_(valores, idx);
  persona.etag = actual.etag;
  var actualizado = conReintento_(function () {
    return People.People.updateContact(persona, resourceName, { updatePersonFields: CAMPOS_PERSONA });
  });
  return actualizado.resourceName;
}

function construirPersona_(valores, idx) {
  var nombre = valores[idx[COLUMNAS.nombre]] || "";
  var apellido = valores[idx[COLUMNAS.apellido]] || "";
  var whatsapp = valores[idx[COLUMNAS.whatsapp]];
  var fijo = valores[idx[COLUMNAS.telefonoFijo]];
  var email = valores[idx[COLUMNAS.email]];
  var empresa = valores[idx[COLUMNAS.empresa]];
  var cargo = valores[idx[COLUMNAS.cargo]];
  var domicilio = [
    valores[idx[COLUMNAS.domicilio]],
    valores[idx[COLUMNAS.ciudad]],
    valores[idx[COLUMNAS.provincia]],
    valores[idx[COLUMNAS.pais]],
  ]
    .filter(String)
    .join(", ");
  var nota = valores[idx[COLUMNAS.notaReferencia]];

  var persona = {
    names: [{ givenName: nombre, familyName: apellido }],
  };

  var telefonos = [];
  if (whatsapp) telefonos.push({ value: String(whatsapp), type: "mobile" });
  if (fijo) telefonos.push({ value: String(fijo), type: "home" });
  if (telefonos.length) persona.phoneNumbers = telefonos;

  if (email) persona.emailAddresses = [{ value: String(email), type: "home" }];
  if (empresa || cargo) persona.organizations = [{ name: empresa || "", title: cargo || "" }];
  if (domicilio) persona.addresses = [{ formattedValue: domicilio, type: "home" }];
  if (nota) persona.biographies = [{ value: String(nota), contentType: "TEXT" }];

  return persona;
}

function asegurarColumnas_(hoja, encabezados, idx) {
  var faltan = [COLUMNAS.idGoogle, COLUMNAS.ultimaSync].filter(function (c) {
    return !(c in idx);
  });
  if (faltan.length === 0) return idx;

  var col = encabezados.length;
  faltan.forEach(function (nombreCol) {
    col++;
    hoja.getRange(1, col).setValue(nombreCol);
    idx[nombreCol] = col - 1;
  });
  return idx;
}

function conReintento_(fn) {
  var intentos = 0;
  while (true) {
    try {
      return fn();
    } catch (err) {
      var mensaje = String(err).toLowerCase();
      var esCuota = mensaje.indexOf("429") !== -1 || mensaje.indexOf("quota") !== -1 || mensaje.indexOf("rate") !== -1;
      if (!esCuota || intentos >= 4) throw err;
      intentos++;
      Utilities.sleep(1000 * Math.pow(2, intentos)); // 2s, 4s, 8s, 16s
    }
  }
}
