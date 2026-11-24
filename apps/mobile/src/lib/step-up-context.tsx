import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { stepUpChoices, type StepUpMethodResponse, type StepUpPurpose } from '@revime/shared';
import { StepUpSheet, type StepUpRequest } from '../components/StepUpSheet';
import { api } from './api';
import { isAppleAuthAvailable } from './apple-auth';
import { runWithStepUp, type StepUpResult } from './step-up';

type WithStepUp = <T>(call: () => Promise<T>, purpose?: StepUpPurpose) => Promise<StepUpResult<T>>;

const StepUpContext = createContext<WithStepUp | null>(null);

/**
 * V7 A11 (U2b). One `StepUpSheet` for the whole app, mounted in `app/_layout.tsx` inside the theme.
 * `useStepUp()` hands a screen `withStepUp(call)`: it runs the call, and on `STEP_UP_REQUIRED` opens
 * the sheet and runs it once more after the user confirmed.
 *
 * V9 U3 (`DEC9-09`): the sheet offers what `stepUpChoices` says for this account and this purpose; a
 * deletion passes `'DELETE'`, so a linked account confirms with its provider. Apple counts only where
 * the device can sign in with it (iOS with the native module).
 */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<StepUpRequest | null>(null);
  const pending = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback(async (purpose: StepUpPurpose) => {
    const response = await api.get<StepUpMethodResponse>('/security/step-up');
    // `?? []` / `?? false`: an API older than this build answers `{ method }` only.
    const providers = response.providers ?? [];
    const choices = stepUpChoices({
      providers,
      hasPassword: response.hasPassword ?? response.method === 'PASSWORD',
      purpose,
      appleAvailable: Platform.OS === 'ios' && isAppleAuthAvailable(),
    });
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setRequest({ choices, providers });
    });
  }, []);

  const withStepUp = useCallback<WithStepUp>(
    (call, purpose = 'SENSITIVE') => runWithStepUp(call, () => confirm(purpose)),
    [confirm],
  );

  const onDone = (confirmed: boolean) => {
    setRequest(null);
    pending.current?.(confirmed);
    pending.current = null;
  };

  return (
    <StepUpContext.Provider value={withStepUp}>
      {children}
      <StepUpSheet request={request} onDone={onDone} />
    </StepUpContext.Provider>
  );
}

export function useStepUp(): WithStepUp {
  const ctx = useContext(StepUpContext);
  if (!ctx) throw new Error('useStepUp must be used inside StepUpProvider');
  return ctx;
}
