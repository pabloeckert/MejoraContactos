import type { UnifiedContact } from "@/types/contact";

/**
 * Contactos ficticios para el modo demostración (Fase 7 de MejoraSuite).
 * Pensados para mostrar todas las features de un vistazo: duplicados
 * (mismo nombre/teléfono con variaciones), un teléfono inválido, un email
 * roto, algunos ya "limpiados por IA" y scores de validación variados —
 * así el toggle no solo llena la tabla, deja algo real para explorar en
 * Resultados/Exportar/Dashboard.
 */
export const DEMO_CONTACTS: UnifiedContact[] = [
  {
    id: "demo-1", firstName: "Juan", lastName: "Pérez García", whatsapp: "+54 9 11 4567-8901",
    company: "Acme Corp", jobTitle: "Director de Ventas", email: "juan.perez@acmecorp.com",
    source: "demo-contacts.csv", isDuplicate: false, confidence: 95, aiCleaned: true,
    phoneValid: true, phoneWhatsApp: true, phoneCountry: "AR", validationScore: 95, segment: "A",
  },
  {
    id: "demo-2", firstName: "Juan", lastName: "Perez Garcia", whatsapp: "+541145678901",
    company: "Acme Corp", jobTitle: "Director de ventas", email: "juan.perez@acmecorp.com",
    source: "demo-contacts-viejo.xlsx", isDuplicate: true, duplicateOf: "demo-1", confidence: 88,
    aiCleaned: false, phoneValid: true, phoneWhatsApp: true, phoneCountry: "AR", validationScore: 70, segment: "A",
  },
  {
    id: "demo-3", firstName: "María", lastName: "López", whatsapp: "+54 9 376 400-0000",
    company: "TechStart", jobTitle: "CEO", email: "maria.lopez@techstart.io",
    source: "demo-contacts.csv", isDuplicate: false, confidence: 97, aiCleaned: true,
    phoneValid: true, phoneWhatsApp: true, phoneCountry: "AR", validationScore: 98, segment: "A",
  },
  {
    id: "demo-4", firstName: "Carlos", lastName: "Rodríguez", whatsapp: "123",
    company: "", jobTitle: "", email: "carlos@",
    source: "demo-contacts-viejo.xlsx", isDuplicate: false, confidence: 20, aiCleaned: false,
    phoneValid: false, phoneWhatsApp: false, validationScore: 15, segment: "C", needsAIScoring: true,
  },
  {
    id: "demo-5", firstName: "Ana", lastName: "Martínez", whatsapp: "+34 612 345 678",
    company: "GlobalTech", jobTitle: "Ingeniera de Software", email: "ana.martinez@globaltech.es",
    source: "demo-contacts.csv", isDuplicate: false, confidence: 93, aiCleaned: true,
    phoneValid: true, phoneWhatsApp: true, phoneCountry: "ES", validationScore: 91, segment: "B",
  },
  {
    id: "demo-6", firstName: "Pedro", lastName: "Gómez", whatsapp: "+52 55 1234 5678",
    company: "InnovaLab", jobTitle: "Product Manager", email: "pedro.gomez@innovalab.mx",
    source: "demo-contacts.csv", isDuplicate: false, confidence: 90, aiCleaned: false,
    phoneValid: true, phoneWhatsApp: true, phoneCountry: "MX", validationScore: 85, segment: "B",
  },
  {
    id: "demo-7", firstName: "Luis", lastName: "Fernández", whatsapp: "+54 9 11 2345-6789",
    company: "", jobTitle: "Diseñador", email: "luis.fern@yahoo.com",
    source: "demo-contacts-viejo.xlsx", isDuplicate: false, confidence: 60, aiCleaned: false,
    phoneValid: true, phoneWhatsApp: true, phoneCountry: "AR", validationScore: 55, segment: "C", needsAIScoring: true,
  },
  {
    id: "demo-8", firstName: "Sofía", lastName: "Hernández", whatsapp: "+52 55 9876 5432",
    company: "MegaSoft", jobTitle: "Data Analyst", email: "sofia.hernandez@megasoft.mx",
    source: "demo-contacts.csv", isDuplicate: false, confidence: 96, aiCleaned: true,
    phoneValid: true, phoneWhatsApp: true, phoneCountry: "MX", validationScore: 94, segment: "A",
  },
  {
    id: "demo-9", firstName: "Roberto", lastName: "Díaz", whatsapp: "+34 91 234 5678",
    company: "IberiaTech", jobTitle: "CTO", email: "roberto.diaz@iberiatech.es",
    source: "demo-contacts.csv", isDuplicate: false, confidence: 92, aiCleaned: false,
    phoneValid: true, phoneWhatsApp: false, phoneCountry: "ES", validationScore: 80, segment: "B",
  },
  {
    id: "demo-10", firstName: "Roberto", lastName: "Diaz", whatsapp: "+34912345678",
    company: "IberiaTech", jobTitle: "CTO", email: "roberto.diaz@iberiatech.es",
    source: "demo-contacts-viejo.xlsx", isDuplicate: true, duplicateOf: "demo-9", confidence: 85,
    aiCleaned: false, phoneValid: true, phoneWhatsApp: false, phoneCountry: "ES", validationScore: 65, segment: "B",
  },
  {
    id: "demo-11", firstName: "Diego", lastName: "Morales", whatsapp: "+54 11 5555-1234",
    company: "StartupXYZ", jobTitle: "Fundador", email: "",
    source: "demo-contacts-viejo.xlsx", isDuplicate: false, confidence: 55, aiCleaned: false,
    phoneValid: true, phoneWhatsApp: true, phoneCountry: "AR", validationScore: 60, segment: "C",
  },
  {
    id: "demo-12", firstName: "Laura", lastName: "Torres", whatsapp: "+52 1 55 4444 3333",
    company: "Consultora Azul", jobTitle: "Consultora Senior", email: "laura.t@gmail.com",
    source: "demo-contacts.csv", isDuplicate: false, confidence: 94, aiCleaned: true,
    phoneValid: true, phoneWhatsApp: true, phoneCountry: "MX", validationScore: 90, segment: "A",
  },
  {
    id: "demo-13", firstName: "Gabriel", lastName: "Ruiz", whatsapp: "+56 9 8765 4321",
    company: "Santiago Digital", jobTitle: "DevOps Engineer", email: "gabriel.ruiz@santiagodigital.cl",
    source: "demo-contacts.csv", isDuplicate: false, confidence: 91, aiCleaned: false,
    phoneValid: true, phoneWhatsApp: true, phoneCountry: "CL", validationScore: 88, segment: "B",
  },
  {
    id: "demo-14", firstName: "Valentina", lastName: "Castro", whatsapp: "+54 11 7777-8888",
    company: "Buenos Aires Tech", jobTitle: "Frontend Developer", email: "valentina.c@baires.tech",
    source: "demo-contacts.csv", isDuplicate: false, confidence: 93, aiCleaned: true,
    phoneValid: true, phoneWhatsApp: true, phoneCountry: "AR", validationScore: 92, segment: "A",
  },
  {
    id: "demo-15", firstName: "Camilo", lastName: "Restrepo", whatsapp: "+57 300 123 4567",
    company: "Medellín Software", jobTitle: "Backend Developer", email: "camilo@medellinsw.co",
    source: "demo-contacts.csv", isDuplicate: false, confidence: 90, aiCleaned: false,
    phoneValid: true, phoneWhatsApp: true, phoneCountry: "CO", validationScore: 87, segment: "B",
  },
];
