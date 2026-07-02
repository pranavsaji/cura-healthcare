/**
 * Branded (nominal) id types so a SessionId can never be passed where a NoteId
 * is expected. At runtime these are plain strings; the brand exists only in the
 * type system.
 */

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type OrgId = Brand<string, "OrgId">;
export type UserId = Brand<string, "UserId">;
export type ClientId = Brand<string, "ClientId">;
export type SessionId = Brand<string, "SessionId">;
export type TranscriptId = Brand<string, "TranscriptId">;
export type NoteId = Brand<string, "NoteId">;
export type TemplateId = Brand<string, "TemplateId">;

export const asOrgId = (s: string): OrgId => s as OrgId;
export const asUserId = (s: string): UserId => s as UserId;
export const asClientId = (s: string): ClientId => s as ClientId;
export const asSessionId = (s: string): SessionId => s as SessionId;
export const asTranscriptId = (s: string): TranscriptId => s as TranscriptId;
export const asNoteId = (s: string): NoteId => s as NoteId;
export const asTemplateId = (s: string): TemplateId => s as TemplateId;
