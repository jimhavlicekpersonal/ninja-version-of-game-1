import m0029 from './0029_localization.sql?raw';
import m0030 from './0030_ticket_stake.sql?raw';
import m0031 from './0031_idempotency_fingerprint.sql?raw';
import m0032 from './0032_auth_nonces.sql?raw';
import m0033 from './0033_purchase_identity.sql?raw';
import m0034 from './0034_match_trophies_index.sql?raw';
import m0035 from './0035_complaints.sql?raw';
import m0036 from './0036_token_rotations.sql?raw';
import m0037 from './0037_notice_parts.sql?raw';
import m0038 from './0038_village_parts.sql?raw';
/**
 * Every migration, bundled into the server build (no files are read at run
 * time). Add each new file here: an explicit list, because a glob import would
 * be cached by Vitest's module cache and miss a new file. A test checks that
 * every .sql file in this folder is listed.
 */
import { loadMigrations } from '../migrate';
import m0001 from './0001_initial.sql?raw';
import m0002 from './0002_ticket_seed.sql?raw';
import m0003 from './0003_base_versions.sql?raw';
import m0004 from './0004_account_deletion.sql?raw';
import m0005 from './0005_moderation.sql?raw';
import m0006 from './0006_server_economy.sql?raw';
import m0007 from './0007_identity_links.sql?raw';
import m0008 from './0008_idempotency.sql?raw';
import m0009 from './0009_ratings.sql?raw';
import m0010 from './0010_purchases.sql?raw';
import m0011 from './0011_push_tokens.sql?raw';
import m0012 from './0012_server_meta.sql?raw';
import m0013 from './0013_staff_tools.sql?raw';
import m0014 from './0014_ticket_rules.sql?raw';
import m0015 from './0015_friends.sql?raw';
import m0016 from './0016_duels_gangs.sql?raw';
import m0017 from './0017_gang_wars.sql?raw';
import m0018 from './0018_spending_protection.sql?raw';
import m0019 from './0019_device_command_numbers.sql?raw';
import m0020 from './0020_import_holds.sql?raw';
import m0021 from './0021_refund_notices.sql?raw';
import m0022 from './0022_ticket_commitment.sql?raw';
import m0023 from './0023_purchase_storefront.sql?raw';
import m0024 from './0024_accounts_minors.sql?raw';
import m0025 from './0025_ticket_scout.sql?raw';
import m0026 from './0026_job_leases.sql?raw';
import m0027 from './0027_play_statistics.sql?raw';
import m0028 from './0028_rules_acceptance.sql?raw';

export const migrations = loadMigrations({
  '0001_initial.sql': m0001,
  '0002_ticket_seed.sql': m0002,
  '0003_base_versions.sql': m0003,
  '0004_account_deletion.sql': m0004,
  '0005_moderation.sql': m0005,
  '0006_server_economy.sql': m0006,
  '0007_identity_links.sql': m0007,
  '0008_idempotency.sql': m0008,
  '0009_ratings.sql': m0009,
  '0010_purchases.sql': m0010,
  '0011_push_tokens.sql': m0011,
  '0012_server_meta.sql': m0012,
  '0013_staff_tools.sql': m0013,
  '0014_ticket_rules.sql': m0014,
  '0015_friends.sql': m0015,
  '0016_duels_gangs.sql': m0016,
  '0017_gang_wars.sql': m0017,
  '0018_spending_protection.sql': m0018,
  '0019_device_command_numbers.sql': m0019,
  '0020_import_holds.sql': m0020,
  '0021_refund_notices.sql': m0021,
  '0022_ticket_commitment.sql': m0022,
  '0023_purchase_storefront.sql': m0023,
  '0024_accounts_minors.sql': m0024,
  '0025_ticket_scout.sql': m0025,
  '0026_job_leases.sql': m0026,
  '0027_play_statistics.sql': m0027,
  '0028_rules_acceptance.sql': m0028,
  '0029_localization.sql': m0029,
  '0030_ticket_stake.sql': m0030,
  '0031_idempotency_fingerprint.sql': m0031,
  '0032_auth_nonces.sql': m0032,
  '0033_purchase_identity.sql': m0033,
  '0034_match_trophies_index.sql': m0034,
  '0035_complaints.sql': m0035,
  '0036_token_rotations.sql': m0036,
  '0037_notice_parts.sql': m0037,
  '0038_village_parts.sql': m0038,
});
