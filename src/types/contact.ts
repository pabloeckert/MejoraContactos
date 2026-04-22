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
  | "whatsapp"
  | "company"
  | "jobTitle"
  | "email"
  | "ignore";

export const CONTACT_FIELDS: { value: ContactField; label: string }[] = [
  { value: "firstName", label: "Nombre" },
  { value: "lastName", label: "Apellido" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "company", label: "Empresa" },
  { value: "jobTitle", label: "Cargo" },
  { value: "email", label: "Email" },
  { value: "ignore", label: "⊘ Ignorar" },
];

export interface UnifiedContact {
  id: string;
  firstName: string;
  lastName: string;
  whatsapp: string;
  company: string;
  jobTitle: string;
  email: string;
  source: string;
  isDuplicate: boolean;
  duplicateOf?: string;
  confidence: number;
  aiCleaned: boolean;
  // Phone validation metadata
  phoneValid?: boolean;
  phoneWhatsApp?: boolean;
  phoneCountry?: string;
  // Field validation scores
  validationScore?: number;
  fieldValidations?: FieldValidation[];
}

export interface FieldValidation {
  field: 'firstName' | 'lastName' | 'whatsapp' | 'email' | 'company' | 'jobTitle';
  isValid: boolean;
  score: number; // 0-100
  correctedValue?: string;
  reason?: string;
}

export interface ContactValidationResult {
  contactId: string;
  validations: FieldValidation[];
  overallScore: number; // 0-100
  needsReview: boolean;
}

export interface ProcessingStats {
  totalRows: number;
  processedRows: number;
  uniqueContacts: number;
  duplicatesFound: number;
  aiCleanedCount: number;
  rowsPerSecond: number;
  startTime: number;
  status: "idle" | "processing" | "cleaning" | "paused" | "done" | "error";
}

export interface ProcessingLog {
  id: string;
  timestamp: Date;
  type: "info" | "warning" | "error" | "success";
  message: string;
}
