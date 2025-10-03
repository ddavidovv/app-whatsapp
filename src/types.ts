export interface Template {
  name: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  language: string;
  components: TemplateComponent[];
  // Custom mapping for this app to link placeholders to shipment data
  placeholderMapping?: (keyof Shipment | 'custom')[];
  // LINKMOBILITY specific fields
  namespace?: string;
  // Aunoa specific fields
  variableNames?: string[];
}

export interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?: string;
  example?: {
    body_text?: (string[])[];
  };
}

export interface Shipment {
  shipping_code: string;
  phone: string;
  receiver_name: string;
  address: string;
  postal_code: string;
  city: string;
  country: string;
  eta: string;
  tracking_url: string;
}

export interface MessageLog {
  id: string;
  direction: "incoming" | "outgoing";
  phone: string;
  shipping_code: string;
  template_name?: string;
  text: string;
  status: "sending" | "sent" | "delivered" | "read" | "failed";
  created_at: string;
}

export interface Placeholder {
    id: number;
    value: string;
    key: keyof Shipment | 'custom';
}

export type ProviderType = 'linkmobility' | 'meta' | 'salesforce' | 'broker_ctt' | 'aunoa';

export type AuthType = 'basic' | 'bearer' | 'oauth' | 'apikey';

export interface Provider {
    id: ProviderType;
    name: string;
    envFile: string;
    description: string;
    authType: AuthType;
}

export interface ProviderConfig {
    type: ProviderType;
    apiBase: string;
    apiVersion?: string;
    apiEndpoint?: string;
    senderId: string;
    username?: string;
    password?: string;
    accessToken?: string;
    apiKey?: string;
    clientId?: string;
    clientSecret?: string;
    instanceUrl?: string;
    platformPartnerId?: string;
    platformId?: string;
    wabaId?: string;
}
