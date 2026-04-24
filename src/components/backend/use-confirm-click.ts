import { useCallback, useEffect, useRef, useState } from "react";

export type UseConfirmClickOptions = {
  timeoutMs?: number;
  resetKey?: string | number | boolean | null;
};

export function useConfirmClick(options: UseConfirmClickOptions = {}) {
  const { timeoutMs = 3500, resetKey } = options;
  const [isConfirming, setIsConfirming] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    setIsConfirming(false);
  }, []);

  useEffect(() => {
    setIsConfirming(false);
  }, [resetKey]);

  useEffect(() => {
    if (!isConfirming) return;
    window.clearTimeout(timeoutRef.current ?? undefined);
    timeoutRef.current = window.setTimeout(() => setIsConfirming(false), timeoutMs);
    return () => window.clearTimeout(timeoutRef.current ?? undefined);
  }, [isConfirming, timeoutMs]);

  const confirmOrRun = useCallback(
    (run: () => void) => {
      if (!isConfirming) {
        setIsConfirming(true);
        return;
      }
      setIsConfirming(false);
      run();
    },
    [isConfirming],
  );

  return { isConfirming, confirmOrRun, reset };
}

