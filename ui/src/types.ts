export interface Contacto {
  cluster_id: string;
  nombre: string;
  apellido: string;
  cargo: string;
  organizacion: string;
  whatsapp: string[];
  telefono_fijo: string[];
  emails: string[];
  tag: string;
  domicilio: string;
  ciudad: string;
  provincia: string;
  pais: string;
  cumpleanos: string;
  foto_url: string;
  nota_referencia: string;
}

export interface Stats {
  raw_records: number;
  normalized_records: number;
  contactos_finales: number;
  pendientes: number;
}

export interface ParPendiente {
  a: number;
  b: number;
  score: number;
}

export interface GrupoPendiente {
  patron: string;
  pares: ParPendiente[];
}
