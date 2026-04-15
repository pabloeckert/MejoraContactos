export interface RawContact {
  [key: string]: string;
}

export interface ParsedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  rows: RawContact[];
  columns: string[];
  addedAt: Date;
}

export interface ColumnMapping {
  source: string;
  target: ContactField;
}

export type ContactField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "email"
  | "phone"
  | "phone2"
  | "company"
  | "jobTitle"
  | "address"
  | "city"
  | "state"
  | "country"
  | "zip"
  | "notes"
  | "website"
  | "birthday"
  | "ignore";

export const CONTACT_FIELDS: { value: ContactField; label: string }[] = [
  { value: "firstName", label: "Nombre" },
  { value: "lastName", label: "Apellido" },
  { value: "fullName", label: "Nombre completo" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Teléfono" },
  { value: "phone2", label: "Teléfono 2" },
  { value: "company", label: "Empresa" },
  { value: "jobTitle", label: "Cargo" },
  { value: "address", label: "Dirección" },
  { value: "city", label: "Ciudad" },
  { value: "state", label: "Estado/Provincia" },
  { value: "country", label: "País" },
  { value: "zip", label: "Código postal" },
  { value: "notes", label: "Notas" },
  { value: "website", label: "Sitio web" },
  { value: "birthday", label: "Cumpleaños" },
  { value: "ignore", label: "⊘ Ignorar" },
];

export interface UnifiedContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phone2: string;
  company: string;
  jobTitle: string;
  address: string;
  city: string;
  state: string;
  country: string;
  zip: string;
  notes: string;
  website: string;
  birthday: string;
  source: string;
  confidence: number; // 0-100
  isDuplicate: boolean;
  duplicateOf?: string;
  phoneValid: boolean;
  phoneFormatted: string;
  countryCode: string;
}

export interface ProcessingStats {
  totalRows: number;
  processedRows: number;
  uniqueContacts: number;
  duplicatesFound: number;
  invalidPhones: number;
  rowsPerSecond: number;
  startTime: number;
  status: "idle" | "processing" | "paused" | "done" | "error";
}

export interface ProcessingLog {
  id: string;
  timestamp: Date;
  type: "info" | "warning" | "error" | "success";
  message: string;
}
