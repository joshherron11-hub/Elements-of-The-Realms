/**
 * Explicit success/failure for simulation operations.
 *
 * Gameplay rejections (not enough coin, contract not open, etc.) are ordinary
 * outcomes, not exceptions. Exceptions are reserved for programmer error.
 */
export type Result<T, E = KernelError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export interface KernelError {
  readonly code: string;
  readonly message: string;
}

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = (code: string, message: string): Result<never, KernelError> => ({
  ok: false,
  error: { code, message },
});
