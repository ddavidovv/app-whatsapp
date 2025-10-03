import { Template, Shipment, MessageLog, ProviderType, Placeholder } from '@/types';
import { getProviderConfig, config } from '@/config';

// @ts-expect-error - Mock templates kept for reference
const MOCK_TEMPLATES: Template[] = [
  // LINKMOBILITY Templates
  {
    name: 'ctt_utility',
    language: 'es',
    category: 'UTILITY',
    namespace: 'b3fecbcc_92c8_4f4b_838d_f94d26afa9e6',
    components: [
      {
        type: 'BODY',
        text: 'Hola {{1}}, tu envío con código de seguimiento {{2}} está en camino. {{3}}.'
      }
    ],
    placeholderMapping: ['receiver_name', 'shipping_code', 'eta'],
  },
  {
    name: 'ctt_utlity2',
    language: 'es',
    category: 'UTILITY',
    namespace: 'b3fecbcc_92c8_4f4b_838d_f94d26afa9e6',
    components: [
      {
        type: 'BODY',
        text: 'Hola {{1}}, hemos intentado entregar tu paquete {{2}} pero {{3}}. Puedes recogerlo en: {{4}}, Punto alternativo 1: {{5}}, Punto alternativo 2: {{6}}.'
      }
    ],
    placeholderMapping: ['receiver_name', 'shipping_code', 'custom', 'address', 'custom', 'custom'],
  },
  // Generic Templates
  {
    name: 'shipment_update_utility',
    language: 'es',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Hola {{1}}, tu envío con código de seguimiento {{2}} tiene una fecha de entrega estimada para el {{3}}. Puedes seguirlo en tiempo real aquí: {{4}}.'
      }
    ],
    placeholderMapping: ['receiver_name', 'shipping_code', 'eta', 'tracking_url'],
  },
  {
    name: 'delivery_attempt_failed',
    language: 'es',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Hola {{1}}, hemos intentado entregar tu paquete {{2}} en {{3}} pero no ha sido posible. Por favor, contacta con nosotros para reprogramar la entrega.'
      }
    ],
    placeholderMapping: ['receiver_name', 'shipping_code', 'address'],
  },
];

const MOCK_SHIPMENT_DATA: { [key: string]: Shipment } = {
  'ABC123XYZ': {
    shipping_code: 'ABC123XYZ',
    phone: '15551234567', // E.164 format for WhatsApp
    receiver_name: 'David García',
    address: 'Calle Falsa 123, Piso 4, Puerta A',
    postal_code: '28001',
    city: 'Madrid',
    country: 'España',
    eta: '25 de Diciembre, 2024 a las 18:30',
    tracking_url: 'https://track.example.com/ABC123XYZ',
  },
  'DEF456LMN': {
    shipping_code: 'DEF456LMN',
    phone: '15557654321',
    receiver_name: 'Ana Martínez',
    address: 'Avenida Principal 456',
    postal_code: '08001',
    city: 'Barcelona',
    country: 'España',
    eta: '26 de Diciembre, 2024 a las 12:00',
    tracking_url: 'https://track.example.com/DEF456LMN',
  }
};

export const fetchTemplates = async (provider?: ProviderType): Promise<Template[]> => {
  const providerConfig = getProviderConfig();
  const activeProvider = provider || providerConfig.type;

  const url = `${config.apiBaseUrl}${config.endpoints.templates}?provider=${activeProvider}`;
  console.log(`API: Fetching templates from ${url}...`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch templates: ${response.status}`);
      return [];
    }
    const templates = await response.json();
    // Filter for UTILITY templates only, as per requirements
    return templates.filter((t: Template) => t.category === 'UTILITY');
  } catch (error) {
    console.error('Error fetching templates:', error);
    return [];
  }
};

export const fetchShipment = async (shippingCode: string): Promise<Shipment> => {
    const url = `${config.apiBaseUrl}${config.endpoints.shipment}/${shippingCode.toUpperCase()}`;
    console.log(`API: Fetching shipment data from ${url}...`);
    await new Promise(resolve => setTimeout(resolve, 800));
    const data = MOCK_SHIPMENT_DATA[shippingCode.toUpperCase()];
    if (data) {
        return data;
    }
    throw new Error('Shipment code not found.');
};

export const sendMessage = async (
    phone: string,
    shippingCode: string,
    template: Template,
    text: string,
    providerType?: ProviderType,
    placeholders?: Placeholder[]
): Promise<MessageLog> => {
    const providerConfig = getProviderConfig();
    const activeProvider = providerType || providerConfig.type;

    let payload: any;

    // Send through backend
    const url = `${config.apiBaseUrl}${config.endpoints.send}`;
    payload = {
        to: phone,
        shipping_code: shippingCode,
        template_name: template.name,
        text: text,
        provider: activeProvider,
        provider_config: {
            ...providerConfig,
            namespace: template.namespace,
            variable_names: template.variableNames || [],
        },
        placeholders: placeholders,
    };

    console.log(`API: Sending message via ${activeProvider} through backend ${url}`);
    console.log('Payload:', payload);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Backend API Error:', errorText);
        throw new Error(`Backend API Error: ${response.status} - ${errorText}`);
    }

    const responseData = await response.json();
    console.log('Backend Response:', responseData);

    return {
        id: responseData.id || `msg_out_${Date.now()}`,
        direction: 'outgoing',
        phone,
        shipping_code: shippingCode,
        template_name: template.name,
        text,
        status: 'sent',
        created_at: responseData.created_at || new Date().toISOString(),
    };
};
