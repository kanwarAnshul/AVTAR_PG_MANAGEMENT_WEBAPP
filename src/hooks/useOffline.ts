import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

/** Global connectivity hook: resolves true when the device has usable internet. */
export const useIsOnline = (): boolean => {
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    const apply = (state: NetInfoState) => {
      // On simulators isConnected can be true while isInternetReachable is
      // still unknown — treat "connected" as online in that case.
      const reachable =
        state.isInternetReachable === true ||
        (state.isInternetReachable === null && state.isConnected === true);
      setIsOnline(reachable);
    };
    const unsub = NetInfo.addEventListener(apply);
    NetInfo.fetch().then(apply).catch(() => {});
    return unsub;
  }, []);

  return isOnline;
};

export const isWebOfflineCapable = Platform.OS === 'web';
