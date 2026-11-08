-- Additive localization metadata. Canonical messages and player text stay intact.
alter table grove_chat add column if not exists preset_id integer;
alter table push_tokens add column if not exists locale text not null default 'en';
