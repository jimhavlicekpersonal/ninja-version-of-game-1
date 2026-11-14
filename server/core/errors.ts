/**
 * Player-facing server messages as stable codes plus parameters (error codes, 2026-11-14; GUI request
 * "server messages are English sentences"). The catalog is the `srv.<code>` entries of
 * locales/en/messages.json: the server renders the English from it (the `message` older games show and
 * pattern-match), and the game renders the same code in the player's language. `MessageCode` is the
 * typed list, so a code that is not in the catalog does not compile; JSON keys are unique.
 *
 * Every error a player can see goes through `fail` (or `detailError` for text another module wrote,
 * already English the game can match). Staff-only errors (admin API, report and complaint queues) use
 * `staffError` and stay English. tests/backend/server/error-codes.test.ts checks both.
 */
import type messages from '../../locales/en/messages.json';
import { partsText } from '../../locales/runtime';
import type { ErrorBody, ErrorCode, MessageRef } from '../../src/backend/net/protocol';
import { ApiError, type ServerContext } from './context';

type Codes<K> = K extends `srv.${infer C}` ? C : never;
/** Every code in the catalog (`join` only joins parts). */
export type MessageCode = Exclude<Codes<keyof typeof messages>, 'join'>;
export type MessageParams = Record<string, string | number>;
export interface ServerMessage extends MessageRef {
  key: MessageCode;
}

export function msg(key: MessageCode, params?: MessageParams): ServerMessage {
  return params && Object.keys(params).length ? { key, params } : { key };
}

/** The English of these parts, as older games and logs read it. */
export function english(parts: readonly MessageRef[]): string {
  return partsText(parts, 'en');
}

/** A player-facing error: its code, parameters and any following sentences (`more`). */
export function fail(status: number, error: ErrorCode, key: MessageCode, params?: MessageParams, opts: { more?: ServerMessage[]; suggestions?: string[] } = {}): ApiError {
  const parts = [msg(key, params), ...(opts.more ?? [])];
  return new ApiError(status, error, english(parts), opts.suggestions, parts);
}

/** English written by another module (the shared name, base or command checks, a store or sign-in check); the game translates it as before. */
export function detailError(status: number, error: ErrorCode, detail: string, suggestions?: string[]): ApiError {
  return fail(status, error, 'detail', { detail }, { suggestions });
}

/** Staff-only (admin API, report and complaint queues): English, no code. */
export function staffError(status: number, error: ErrorCode, message: string): ApiError {
  return new ApiError(status, error, message);
}

/** The wire body for an ApiError (server/app.ts). */
export function errorBody(e: ApiError): ErrorBody {
  const [first, ...more] = e.parts ?? [];
  return {
    error: e.code,
    message: e.message,
    ...(e.suggestions?.length ? { suggestions: e.suggestions } : {}),
    ...(first ? { key: first.key, ...(first.params ? { params: first.params } : {}) } : {}),
    ...(more.length ? { more } : {}),
  };
}

/** The wire body for a refusal the HTTP adapter makes itself (version, rate limits, unknown routes). */
export function bodyFor(error: ErrorCode, key: MessageCode, params?: MessageParams): ErrorBody {
  return errorBody(fail(0, error, key, params));
}

/** How to disagree with a moderation decision (support contact when the server has one). */
export function appeal(ctx: ServerContext): ServerMessage {
  const contact = ctx.account?.supportContact;
  return contact ? msg('moderation.appeal_contact', { contact }) : msg('moderation.appeal');
}

/** A date as the English text older games show (`toUTCString`, cut to `chars`); the game localizes it. */
export function utcDate(at: number, chars?: number): string {
  const s = new Date(at).toUTCString();
  return chars ? s.slice(0, chars) : s;
}

const BUSY: Record<string, MessageCode> = {
  'The server is shutting down.': 'busy.shutting_down',
  'The server is busy checking battles. Your report will be sent again shortly.': 'busy.battles',
  'The server is busy. Your progress will be sent again shortly.': 'busy.village',
  'The server could not check this battle right now. It will be sent again shortly.': 'busy.battle_check',
};
/** The code for a re-simulation pool refusal (server/resim), by its English. */
export function busyCode(message: string): MessageCode {
  return BUSY[message] ?? 'busy.village';
}
