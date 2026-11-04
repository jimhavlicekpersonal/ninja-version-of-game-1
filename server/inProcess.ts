/**
 * In-process adapter: implements the game's ServerPort by calling the server
 * core directly, with no HTTP. Every value is copied through JSON on the way
 * in and out, so it behaves like the network (no shared objects). Used by
 * tests, and handy for a local sandbox of a future server.
 */
import { ServerError, type ServerPort } from '../src/backend/net/ports';
import type { BattleSubmission, CommandBatch, DonateRequest, FriendRequestBody, PlatformFriendsRequest, PrivacyRequest, LinkCredential, LinkProvider, PurchaseIntentRequest, PushTokenRequest, RedeemRequest, ReportRequest, UploadBaseRequest } from '../src/backend/net/protocol';
import { ApiError, type ServerCore } from './core';

const wire = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export class InProcessServerAdapter implements ServerPort {
  readonly label = 'in-process';
  constructor(
    private readonly core: ServerCore,
    private token: string | null = null,
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
      if (e instanceof ApiError) throw new ServerError(e.status, e.code, e.message);
      throw e;
    }
  }

  private authed<T>(fn: (me: Awaited<ReturnType<ServerCore['authenticate']>>) => Promise<T> | T): Promise<T> {
    return this.call(async () => fn(await this.core.authenticate(this.token ?? undefined)));
  }

  hello() {
    return this.call(() => this.core.hello());
  }

  balance() {
    return this.call(() => this.core.balance());
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
  friends() {
    return this.authed((me) => this.core.friends(me));
  }
  lookupPlayer(name: string) {
    return this.authed((me) => this.core.lookupPlayer(me, name));
  }
  playerByCode(code: string) {
    return this.authed((me) => this.core.playerByCode(me, code));
  }
  sendFriendRequest(req: FriendRequestBody) {
    return this.authed((me) => this.core.friendRequest(me, wire(req)));
  }
  async answerFriendRequest(id: string, accept: boolean) {
    await this.authed((me) => this.core.answerFriendRequest(me, id, accept));
  }
  cancelFriendRequest(id: string) {
    return this.authed((me) => this.core.cancelFriendRequest(me, id));
  }
  unfriend(playerId: string) {
    return this.authed((me) => this.core.unfriend(me, playerId));
  }
  platformFriends(req: PlatformFriendsRequest) {
    return this.authed((me) => this.core.platformFriends(me, wire(req)));
  }
  setPrivacy(req: PrivacyRequest) {
    return this.authed((me) => this.core.setPrivacy(me, wire(req)));
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
