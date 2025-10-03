import { Template, ProviderConfig } from '@/types';

interface LinkMobilityTemplateParameter {
  type: 'text';
  text: string;
}

interface LinkMobilityPayload {
  platformId: string;
  platformPartnerId: number;
  priority: string;
  refId: string;
  customParameters?: Record<string, string>;
  source: string;
  destinations: string[];
  eventReportGates?: string[];
  gateCustomParameters?: Record<string, string>;
  messages: Array<{
    type: 'template';
    template: {
      namespace: string;
      name: string;
      language: {
        code: string;
      };
      components: Array<{
        type: 'body';
        parameters: LinkMobilityTemplateParameter[];
      }>;
    };
  }>;
}

export const buildLinkMobilityPayload = (
  phone: string,
  shippingCode: string,
  template: Template,
  placeholderValues: string[],
  providerConfig: ProviderConfig
): LinkMobilityPayload => {
  // Build parameters array from placeholder values
  const parameters: LinkMobilityTemplateParameter[] = placeholderValues.map(value => ({
    type: 'text',
    text: value,
  }));

  // Ensure phone starts with +
  const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;
  const formattedSource = providerConfig.senderId.startsWith('+')
    ? providerConfig.senderId
    : `+${providerConfig.senderId}`;

  return {
    platformId: providerConfig.platformId || 'CGI',
    platformPartnerId: Number(providerConfig.platformPartnerId) || 27209,
    priority: 'NORMAL',
    refId: `shipment_${shippingCode}`,
    customParameters: {
      shipping_code: shippingCode,
    },
    source: formattedSource,
    destinations: [formattedPhone],
    messages: [
      {
        type: 'template',
        template: {
          namespace: template.namespace || '',
          name: template.name,
          language: {
            code: template.language,
          },
          components: [
            {
              type: 'body',
              parameters,
            },
          ],
        },
      },
    ],
  };
};
