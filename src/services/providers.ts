import { Provider } from '@/types';
import providersData from '../../providers.config.json';

export const getAvailableProviders = (): Provider[] => {
  return providersData.providers as Provider[];
};

export const getProviderById = (id: string): Provider | undefined => {
  return providersData.providers.find(p => p.id === id) as Provider | undefined;
};
