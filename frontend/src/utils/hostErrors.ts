import type { TFunction } from "i18next";

/**
 * The reason a server could not be read, in the user's language.
 *
 * The backend has no translations, so it sends a code alongside its own English
 * sentence. The code is looked up here and the sentence is the fallback for a
 * failure this build does not know about - which is better than showing nothing.
 */
export function hostErrorMessage(
  t: TFunction,
  errorCode: string | null | undefined,
  error: string | null | undefined,
  fallbackKey = "hosts.errors.unreachable",
): string {
  if (errorCode) {
    return t(`hosts.errors.${errorCode}`, {
      defaultValue: error || t(fallbackKey),
    });
  }
  return error || t(fallbackKey);
}
