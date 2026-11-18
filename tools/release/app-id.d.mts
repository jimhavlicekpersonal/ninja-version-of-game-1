export const LEGACY_APP_ID: string;
/** Why a signed build may not use this id, or null. */
export function appIdProblem(id: string | undefined, allowLegacy?: boolean): string | null;
