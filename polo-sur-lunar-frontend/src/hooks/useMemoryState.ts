import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { viewMemory } from "../state/viewMemory";

/**
 * Igual que useState, pero el valor se guarda en el singleton `viewMemory`.
 * Si el componente se desmonta (cambio de pestaña) y vuelve a montarse, arranca con el último valor
 * que la persona dejó en vez del inicial. Solo se guarda cuando la persona cambia el valor.
 */
export function useMemoryState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => (viewMemory.hasValue(key) ? (viewMemory.getValue<T>(key) as T) : initial));
  const latest = useRef<T>(value);

  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (u) => {
      const next = typeof u === "function" ? (u as (prev: T) => T)(latest.current) : u;
      latest.current = next;
      viewMemory.setValue(key, next);
      setValue(next);
    },
    [key],
  );

  return [value, set];
}
