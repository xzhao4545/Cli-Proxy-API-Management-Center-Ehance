import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/services/api/client';
import { authFilesApi } from '@/services/api/authFiles';
import { routingApi } from '@/services/api/routing';
import { useAuthStore } from '@/stores';
import type { AuthFileItem } from '@/types/authFile';
import type { Config } from '@/types/config';
import type { ResponseModelValidationDraft } from '@/types/visualConfig';
import { buildResponseModelProviders } from '../responseModelOptions';

export function useResponseModelOptions(config: Config, rules: ResponseModelValidationDraft[]) {
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const connected = useAuthStore((state) => state.connectionStatus === 'connected');
  const [credentials, setCredentials] = useState<AuthFileItem[]>([]);
  const [definitions, setDefinitions] = useState<Record<string, string[]>>({});
  const channels = JSON.stringify(
    Array.from(new Set(rules.map((rule) => rule.provider.trim().toLowerCase()).filter(Boolean)))
  );

  useEffect(() => {
    let cancelled = false;
    const revision = apiClient.getConnectionRevision();
    const isCurrent = () => !cancelled && revision === apiClient.getConnectionRevision();
    setCredentials([]);
    if (connected) {
      void authFilesApi.list().then(
        (response) => {
          if (isCurrent()) setCredentials(response.files);
        },
        () => {}
      );
    }
    return () => {
      cancelled = true;
    };
  }, [apiBase, managementKey, connected]);

  useEffect(() => {
    let cancelled = false;
    const revision = apiClient.getConnectionRevision();
    setDefinitions({});
    if (connected) {
      const selected: string[] = JSON.parse(channels);
      void routingApi.loadChannelModels(
        selected
          .filter(
            (channel) =>
              channel !== 'openai-compatibility' && !channel.startsWith('openai-compatible-')
          )
          .map((channel) => (channel === 'gemini-cli' ? 'gemini' : channel)),
        (channel, models) => {
          if (cancelled || revision !== apiClient.getConnectionRevision()) return;
          setDefinitions((current) => ({ ...current, [channel]: models ?? [] }));
        }
      );
    }
    return () => {
      cancelled = true;
    };
  }, [apiBase, managementKey, connected, channels]);

  const providers = useMemo(
    () => buildResponseModelProviders(config, credentials),
    [config, credentials]
  );
  return { providers, definitions };
}
