/**
 * The tables of the in-memory adapter, shared by its stores (one file per store, composed into
 * `MemoryRepo` in index.ts). A transaction snapshots every field here.
 */
import type { BaseLayout } from '../../../src/gameplay/sim/battle/types';
import type { AgeBand } from '../../../src/gameplay/sim/age';
import type { Player, DuelRecord, DuelTally, DuelChallenge, Squad, SquadMember, SquadInvite, GangWar, GangWarAttack, GangRelay, GangQueueEntry, FriendRequest, StaffAction, Ticket, AttackRecord, Grove, GroveMember, ChatRow, StatsDailyRow, Report, Block, TroopRequest, Donation, RaidPairing, RaidAttack, RaidClaim, VillageRow, LedgerEntry, CommandLogRow, IdentityLink, PlayerNotice, TokenRow, TokenRotation, PurchaseRow, PurchaseIntent, ImportHold, Complaint, PushToken, DeletionRequest } from '../types';
import type { Repo } from '../ports';

export const clone = <T>(v: T): T => structuredClone(v);

/** A ticket or attack as stored: the base by its content hash. */
export type Stored<T extends { base: BaseLayout }> = Omit<T, 'base'> & { baseHash: string };

export abstract class MemoryBase {
  players = new Map<string, Player>();
  /** Base versions by content hash (stored once, like Postgres's base_versions). */
  bases = new Map<string, { base: BaseLayout; createdAt: number; lastUsedAt: number }>();
  tickets = new Map<string, Stored<Ticket>>();
  attacks: Stored<AttackRecord>[] = [];
  groves = new Map<string, Grove>();
  memberRows: GroveMember[] = [];
  chatRows: ChatRow[] = [];
  requestRows = new Map<string, TroopRequest>();
  donations: Donation[] = [];
  pairings: RaidPairing[] = [];
  raidAttackRows: RaidAttack[] = [];
  claims: RaidClaim[] = [];
  deletionRows: DeletionRequest[] = [];
  reportRows: Report[] = [];
  blockRows: Block[] = [];
  nameHolds = new Map<string, { playerId: string; until: number }>();
  friendshipRows: { a: string; b: string; since: number }[] = [];
  friendRequestRows: FriendRequest[] = [];
  duelRows: DuelRecord[] = [];
  duelTallyRows: DuelTally[] = [];
  challengeRows: DuelChallenge[] = [];
  squadRows = new Map<string, Squad>();
  squadMemberRows: SquadMember[] = [];
  squadInviteRows: SquadInvite[] = [];
  warRows = new Map<string, GangWar>();
  warAttackRows: GangWarAttack[] = [];
  relayRows: GangRelay[] = [];
  gangQueueRows: GangQueueEntry[] = [];
  gangClaimRows: { warId: string; playerId: string; outcome: string; at: number }[] = [];
  villageRows = new Map<string, VillageRow>();
  tokenRows: TokenRow[] = [];
  rotationRows: TokenRotation[] = [];
  nonceRows = new Map<string, number>();
  deletionCodeRows = new Map<string, { codeHash: string; createdAt: number; expiresAt: number }>();
  noticeRows: PlayerNotice[] = [];
  linkRows: IdentityLink[] = [];
  purchaseRows: PurchaseRow[] = [];
  storeNoticeRows: { id: string; store: string; ref: string | null; type: string; signedAt: number; receivedAt: number }[] = [];
  staffRows: StaffAction[] = [];
  intentRows: PurchaseIntent[] = [];
  ageRows = new Map<string, { under18: boolean; at: number; band?: AgeBand | null }>();
  importHoldRows: ImportHold[] = [];
  complaintRows: Complaint[] = [];
  pushRows: PushToken[] = [];
  ledgerRows: LedgerEntry[] = [];
  commandRows: CommandLogRow[] = [];
  idempotencyRows = new Map<string, { status: number; body: unknown; createdAt: number; fingerprint: string | null }>();
  protected seq = 0;
  statsRows: { install: string; day: number; name: string; at: number; props: Record<string, unknown>; build: string; arm: string; receivedAt: number }[] = [];
  statsDailyRows: StatsDailyRow[] = [];
  protected jobLeases = new Map<string, { holder: string; until: number }>();
  refundRows = new Map<string, { at: number; why: string }>();

  /** This repo as the whole port (for calls into another store). */
  protected get repo(): Repo {
    return this as unknown as Repo;
  }
}
