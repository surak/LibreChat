import { useRecoilValue } from 'recoil';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery } from '@tanstack/react-query';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import store from '~/store';

export const useGetEndpointsQuery = <TData = t.TEndpointsConfig>(
  config?: UseQueryOptions<t.TEndpointsConfig, unknown, TData>,
): QueryObserverResult<TData> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<t.TEndpointsConfig, unknown, TData>(
    [QueryKeys.endpoints],
    () => dataService.getAIEndpoints(),
    {
      staleTime: 0,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
      select: (data) => {
        const filteredData: t.TEndpointsConfig = {};
        const blockedModels = new Set(['gpt-3.5-turbo', 'text-davinci-003', 'text-embedding-ada-002']);
        for (const key in data) {
          const ep = data[key];
          if (!ep) {
            filteredData[key] = ep;
            continue;
          }
          filteredData[key] = {
            ...ep,
            models: ep.models
              ? {
                  ...ep.models,
                  default: ep.models.default?.filter((model) => {
                    const name = typeof model === 'string' ? model : model.name;
                    const lowerName = name.toLowerCase();
                    return (
                      !name.startsWith('alias-') &&
                      !blockedModels.has(name) &&
                      !lowerName.includes('embedding')
                    );
                  }),
                }
              : ep.models,
          };
        }
        return config?.select ? config.select(filteredData) : (filteredData as unknown as TData);
      },
    },
  );
};

export const useGetStartupConfig = (
  config?: UseQueryOptions<t.TStartupConfig>,
): QueryObserverResult<t.TStartupConfig> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<t.TStartupConfig>(
    [QueryKeys.startupConfig],
    () => dataService.getStartupConfig(),
    {
      staleTime: 0,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
      select: (data) => {
        const blockedModels = new Set(['gpt-3.5-turbo', 'text-davinci-003', 'text-embedding-ada-002']);
        const filteredData = {
          ...data,
          modelSpecs: data?.modelSpecs
            ? {
                ...data.modelSpecs,
                list: data.modelSpecs.list?.filter((spec) => {
                  const name = spec.name;
                  const lowerName = name.toLowerCase();
                  return (
                    !name.startsWith('alias-') &&
                    !blockedModels.has(name) &&
                    !lowerName.includes('embedding')
                  );
                }),
              }
            : data?.modelSpecs,
        };
        return config?.select
          ? config.select(filteredData as t.TStartupConfig)
          : (filteredData as t.TStartupConfig);
      },
    },
  );
};
