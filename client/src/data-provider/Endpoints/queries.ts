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
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
      select: (data) => {
        const filteredData: t.TEndpointsConfig = {};
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
                    return !name.startsWith('alias-');
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
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
      select: (data) => {
        const filteredData = {
          ...data,
          modelSpecs: data?.modelSpecs
            ? {
                ...data.modelSpecs,
                list: data.modelSpecs.list?.filter((spec) => !spec.name.startsWith('alias-')),
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
