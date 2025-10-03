// This file reads from Vite's environment variables, which are populated from .env files.
// See: https://vitejs.dev/guide/env-and-mode.html

import { ProviderConfig, ProviderType } from '@/types';

// Application configuration derived from the environment variables
export const config = {
  // Base URL for the backend API this frontend will call
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,

  endpoints: {
    templates: '/templates',
    shipment: '/shipment', // Will be appended with /:shipping_code
    send: '/send',
    eventsStream: '/events/stream',
  },

  webhook: {
    verifyToken: import.meta.env.VITE_WEBHOOK_VERIFY_TOKEN,
  },
};

// Get provider configuration from environment variables
export const getProviderConfig = (): ProviderConfig => {
  return {
    type: (import.meta.env.VITE_PROVIDER_TYPE || 'linkmobility') as ProviderType,
    apiBase: import.meta.env.VITE_PROVIDER_API_BASE || '',
    apiVersion: import.meta.env.VITE_PROVIDER_API_VERSION,
    apiEndpoint: import.meta.env.VITE_PROVIDER_API_ENDPOINT,
    senderId: import.meta.env.VITE_PROVIDER_SENDER_ID || '',
    username: import.meta.env.VITE_PROVIDER_USERNAME,
    password: import.meta.env.VITE_PROVIDER_PASSWORD,
    accessToken: import.meta.env.VITE_PROVIDER_ACCESS_TOKEN,
    apiKey: import.meta.env.VITE_PROVIDER_API_KEY,
    clientId: import.meta.env.VITE_PROVIDER_CLIENT_ID,
    clientSecret: import.meta.env.VITE_PROVIDER_CLIENT_SECRET,
    instanceUrl: import.meta.env.VITE_PROVIDER_INSTANCE_URL,
    platformPartnerId: import.meta.env.VITE_PROVIDER_PLATFORM_PARTNER_ID,
    platformId: import.meta.env.VITE_PROVIDER_PLATFORM_ID,
    wabaId: import.meta.env.VITE_PROVIDER_WABA_ID,
  };
};
