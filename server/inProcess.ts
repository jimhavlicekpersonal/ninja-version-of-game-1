/**
 * In-process adapter: implements the game's ServerPort by calling the server
 * core directly, with no HTTP. Every value is copied through JSON on the way
 * in and out, so it behaves like the network (no shared objects). Used by
 * tests, and handy for a local sandbox of a future server.
 */
import { ServerError, type ServerPort } from '../src/backend/net/ports';
import type { BattleSubmission, CommandBatch, DonateRequest, DuelSubmission, DuelTicketRequest, FriendImportRequest, FriendRequestRequest, LinkCredential, LinkProvider, PrivacyRequest, PurchaseIntentRequest, PushTokenRequest, RedeemRequest, ReportRequest, UploadBaseRequest } from '../src/backend/net/protocol';
import { ApiError, type ServerCore } from './core';
import type { ClientInfo } from './repo';

const wire = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export class InProcessServerAdapter implements ServerPort {
  readonly label = 'in-process';
  constructor(
    private readonly core: ServerCore,
    private token: string | null = null,
    /** What this "game" would send in its headers (step 72): an older game's rules, say. None by default. */
    private readonly client: ClientInfo = {},
  ) {}

  hasIdentity(): boolean {
    return Boolean(this.token);
  }

  /** The player's secret, for tests that need to share it. */
  get credentials(): string | null {
    return this.token;
  }

  private async call<T>(fn: () => Promise<T> | T): Promise<T> {
    try {
      return wire(await fn());
    } catch (e) {
      if (e instanceof ApiError) throw new ServerError(e.status, e.code, e.message, e.details?.suggestions ?? []);
      throw e;
    }
  }

  private authed<T>(fn: (me: Awaited<ReturnType<ServerCore['authenticate']>>) => Promise<T> | T): Promise<T> {
    return this.call(async () => fn({ ...(await this.core.authenticate(this.token ?? undefined)), client: { ...this.client } }));
  }

  hello() {
    return this.call(() => this.core.hello());
  }
  async register(name: string) {
    const r = await this.call(() => this.core.register(name));
    this.token = r.token;
    return r;
  }
  me() {
    return this.authed((me) => this.core.me(me));
  }
  rename(name: string) {
    return this.authed((me) => this.core.rename(me, name));
  }
  links() {
    return this.authed((me) => this.core.links(me));
  }
  link(provider: LinkProvider, credential: LinkCredential) {
    return this.authed((me) => this.core.link(me, wire({ provider, credential })));
  }
  unlink(provider: LinkProvider) {
    return this.authed((me) => this.core.unlink(me, provider));
  }
  async signIn(provider: LinkProvider, credential: LinkCredential, device?: string) {
    const r = await this.call(() => this.core.signIn(wire({ provider, credential, device })));
    this.token = r.token;
    return r;
  }
  async deleteAccount() {
    await this.authed((me) => this.core.deleteAccount(me));
    this.token = null;
  }
  uploadBase(req: UploadBaseRequest) {
    return this.authed((me) => this.core.uploadBase(me, wire(req)));
  }
  match() {
    return this.authed((me) => this.core.match(me));
  }
  submitAttack(sub: BattleSubmission) {
    return this.authed((me) => this.core.attack(me, wire(sub)));
  }
  defenses(since: number) {
    return this.authed((me) => this.core.defenses(me, since));
  }
  powerLeaderboard(limit = 50) {
    return this.authed((me) => this.core.powerLeaderboard(me, limit));
  }
  seasonLeaderboard(season?: number, limit = 50) {
    return this.authed((me) => this.core.seasonLeaderboard(me, season, limit));
  }
  leaderboard(limit = 50) {
    return this.authed((me) => this.core.leaderboard(me, limit));
  }
  listGroves(query = '') {
    return this.authed((me) => this.core.listGroves(me, query));
  }
  createGrove(name: string) {
    return this.authed((me) => this.core.createGrove(me, name));
  }
  joinGrove(id: string) {
    return this.authed((me) => this.core.joinGrove(me, id));
  }
  leaveGrove() {
    return this.authed((me) => this.core.leaveGrove(me));
  }
  myGrove() {
    return this.authed((me) => this.core.myGrove(me));
  }
  chat(after?: string) {
    return this.authed((me) => this.core.chat(me, after));
  }
  postChat(text: string) {
    return this.authed((me) => this.core.postChat(me, text));
  }
  requests() {
    return this.authed((me) => this.core.requests(me));
  }
  requestTroops(capacity: number) {
    return this.authed((me) => this.core.requestTroops(me, capacity));
  }
  donate(requestId: string, req: DonateRequest) {
    return this.authed((me) => this.core.donate(me, requestId, wire(req)));
  }
  inbox() {
    return this.authed((me) => this.core.inbox(me));
  }
  ackInbox(ids: string[]) {
    return this.authed((me) => this.core.ackInbox(me, wire(ids)));
  }
  async getVillage() {
    try {
      return await this.authed((me) => this.core.getVillage(me));
    } catch (e) {
      if (e instanceof ServerError && e.code === 'no_village') return null;
      throw e;
    }
  }
  startVillage() {
    return this.authed((me) => this.core.startVillage(me));
  }
  importVillage(file: unknown) {
    return this.authed((me) => this.core.importVillage(me, wire({ file })));
  }
  sendCommands(batch: CommandBatch) {
    return this.authed((me) => this.core.villageCommands(me, wire(batch)));
  }
  ledger(limit = 50) {
    return this.authed((me) => this.core.ledger(me, limit));
  }
  lookup(name: string) {
    return this.authed((me) => this.core.lookup(me, name));
  }
  friends() {
    return this.authed((me) => this.core.friends(me));
  }
  requestFriend(req: FriendRequestRequest) {
    return this.authed((me) => this.core.requestFriend(me, wire(req)));
  }
  answerFriendRequest(id: string, accept: boolean) {
    return this.authed((me) => this.core.answerFriendRequest(me, id, { accept }));
  }
  removeFriend(id: string) {
    return this.authed((me) => this.core.removeFriend(me, id));
  }
  setPrivacy(req: PrivacyRequest) {
    return this.authed((me) => this.core.setPrivacy(me, wire(req)));
  }
  friendSuggestions() {
    return this.authed((me) => this.core.friendSuggestions(me));
  }
  importFriends(req: FriendImportRequest) {
    return this.authed((me) => this.core.importFriends(me, wire(req)));
  }
  duelTicket(req: DuelTicketRequest) {
    return this.authed((me) => this.core.duelTicket(me, wire(req)));
  }
  submitDuel(sub: DuelSubmission) {
    return this.authed((me) => this.core.submitDuel(me, wire(sub)));
  }
  duels() {
    return this.authed((me) => this.core.duels(me));
  }
  challengeFriend(friendId: string) {
    return this.authed((me) => this.core.challengeFriend(me, friendId));
  }
  async setDuelLayout(base: unknown) {
    await this.authed((me) => this.core.setDuelLayout(me, wire({ base })));
  }
  gangWar() {
    return this.authed((me) => this.core.gangWar(me));
  }
  queueGangWar() {
    return this.authed((me) => this.core.queueGangWar(me));
  }
  leaveGangWarQueue() {
    return this.authed((me) => this.core.leaveGangWarQueue(me));
  }
  setGangWarBase(base: unknown) {
    return this.authed((me) => this.core.setGangWarBase(me, wire({ base })));
  }
  gangWarTicket(target: number, relay: boolean) {
    return this.authed((me) => this.core.gangWarTicket(me, { target, relay }));
  }
  gangWarAttack(sub: BattleSubmission) {
    return this.authed((me) => this.core.gangWarAttack(me, wire(sub)));
  }
  claimGangWar() {
    return this.authed((me) => this.core.claimGangWar(me));
  }
  myGang() {
    return this.authed((me) => this.core.myGang(me));
  }
  createGang(name: string) {
    return this.authed((me) => this.core.createGang(me, name));
  }
  inviteToGang(friendId: string) {
    return this.authed((me) => this.core.inviteToGang(me, friendId));
  }
  answerGangInvite(id: string, accept: boolean) {
    return this.authed((me) => this.core.answerGangInvite(me, id, { accept }));
  }
  leaveGang() {
    return this.authed((me) => this.core.leaveGang(me));
  }
  handOverGang(playerId: string) {
    return this.authed((me) => this.core.handOverGang(me, playerId));
  }
  gangChat(after?: string) {
    return this.authed((me) => this.core.gangChat(me, after));
  }
  postGangChat(text: string) {
    return this.authed((me) => this.core.postGangChat(me, text));
  }
  gangRequests() {
    return this.authed((me) => this.core.gangRequests(me));
  }
  gangRequestTroops(capacity: number) {
    return this.authed((me) => this.core.gangRequestTroops(me, capacity));
  }
  gangDonate(requestId: string, req: DonateRequest) {
    return this.authed((me) => this.core.gangDonate(me, requestId, wire(req)));
  }
  purchaseIntent(req: PurchaseIntentRequest) {
    return this.authed((me) => this.core.purchaseIntent(me, wire(req)));
  }
  redeem(req: RedeemRequest) {
    return this.authed((me) => this.core.redeem(me, wire(req)));
  }
  purchaseHistory() {
    return this.authed((me) => this.core.purchaseHistory(me));
  }
  async putPushToken(req: PushTokenRequest) {
    await this.authed((me) => this.core.putPushToken(me, wire(req)));
  }
  async deletePushToken(token: string) {
    await this.authed((me) => this.core.deletePushToken(me, token));
  }
  report(req: ReportRequest) {
    return this.authed((me) => this.core.report(me, wire(req)));
  }
  block(playerId: string) {
    return this.authed((me) => this.core.block(me, playerId));
  }
  unblock(playerId: string) {
    return this.authed((me) => this.core.unblock(me, playerId));
  }
  blocks() {
    return this.authed((me) => this.core.blocks(me));
  }
  raid() {
    return this.authed((me) => this.core.raid(me));
  }
  raidTicket(target: number) {
    return this.authed((me) => this.core.raidTicket(me, target));
  }
  submitRaidAttack(sub: BattleSubmission) {
    return this.authed((me) => this.core.raidAttack(me, wire(sub)));
  }
  claimRaid(week: number) {
    return this.authed((me) => this.core.claimRaid(me, week));
  }
}
