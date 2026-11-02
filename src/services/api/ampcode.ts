/**
 * Amp CLI integration (ampcode) API.
 */

import { apiClient } from './client';
import {
  normalizeAmpcodeConfig,
  normalizeAmpcodeModelMappings,
  normalizeAmpcodeUpstreamApiKeys,
} from './transformers';
import type { AmpcodeConfig, AmpcodeModelMapping, AmpcodeUpstreamApiKeyMapping } from '@/types';

// The backend mounts Amp as a custom extension under /v0/management.
const ampcodeUrl = (path: string) => apiClient.getExtensionUrl(`/v0/management/ampcode${path}`);

const serializeUpstreamApiKeyMappings = (mappings: AmpcodeUpstreamApiKeyMapping[]) =>
  mappings.map((mapping) => ({
    'upstream-api-key': mapping.upstreamApiKey,
    'api-keys': mapping.apiKeys,
  }));

export const ampcodeApi = {
  async getAmpcode(): Promise<AmpcodeConfig> {
    const data = await apiClient.get(ampcodeUrl(''));
    return normalizeAmpcodeConfig(data) ?? {};
  },

  updateUpstreamUrl: (url: string) => apiClient.put(ampcodeUrl('/upstream-url'), { value: url }),
  clearUpstreamUrl: () => apiClient.delete(ampcodeUrl('/upstream-url')),

  updateUpstreamApiKey: (apiKey: string) =>
    apiClient.put(ampcodeUrl('/upstream-api-key'), { value: apiKey }),
  clearUpstreamApiKey: () => apiClient.delete(ampcodeUrl('/upstream-api-key')),

  async getUpstreamApiKeys(): Promise<AmpcodeUpstreamApiKeyMapping[]> {
    const data = await apiClient.get<Record<string, unknown>>(ampcodeUrl('/upstream-api-keys'));
    const list = data?.['upstream-api-keys'] ?? data?.upstreamApiKeys ?? data?.items ?? data;
    return normalizeAmpcodeUpstreamApiKeys(list);
  },

  saveUpstreamApiKeys: (mappings: AmpcodeUpstreamApiKeyMapping[]) =>
    apiClient.put(ampcodeUrl('/upstream-api-keys'), {
      value: serializeUpstreamApiKeyMappings(mappings),
    }),
  patchUpstreamApiKeys: (mappings: AmpcodeUpstreamApiKeyMapping[]) =>
    apiClient.patch(ampcodeUrl('/upstream-api-keys'), {
      value: serializeUpstreamApiKeyMappings(mappings),
    }),
  deleteUpstreamApiKeys: (upstreamApiKeys: string[]) =>
    apiClient.delete(ampcodeUrl('/upstream-api-keys'), { data: { value: upstreamApiKeys } }),

  async getModelMappings(): Promise<AmpcodeModelMapping[]> {
    const data = await apiClient.get<Record<string, unknown>>(ampcodeUrl('/model-mappings'));
    const list = data?.['model-mappings'] ?? data?.modelMappings ?? data?.items ?? data;
    return normalizeAmpcodeModelMappings(list);
  },

  saveModelMappings: (mappings: AmpcodeModelMapping[]) =>
    apiClient.put(ampcodeUrl('/model-mappings'), { value: mappings }),
  patchModelMappings: (mappings: AmpcodeModelMapping[]) =>
    apiClient.patch(ampcodeUrl('/model-mappings'), { value: mappings }),
  clearModelMappings: () => apiClient.delete(ampcodeUrl('/model-mappings')),
  deleteModelMappings: (fromList: string[]) =>
    apiClient.delete(ampcodeUrl('/model-mappings'), { data: { value: fromList } }),

  updateForceModelMappings: (enabled: boolean) =>
    apiClient.put(ampcodeUrl('/force-model-mappings'), { value: enabled }),
};
