/**
 * In-process adapter: implements the game's ServerPort by calling the server
 * core directly, with no HTTP. Every value is copied through JSON on the way
 * in and out, so it behaves like the network (no shared objects). Used by
 * tests, and handy for a local sandbox of a future server.
 */
import { ServerError, type ServerPort } from '../src/backend/net/ports';
import type { BattleSubmission, DonateRequest, LeaderboardBoard, MatchRequest, TournamentSubmission, UploadBaseRequest } from '../src/backend/net/protocol';
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
  async register(name: string, device?: string) {
    const r = await this.call(() => this.core.register(name, device));
    this.token = r.token;
    return r;
  }
  me() {
    return this.authed((me) => this.core.me(me));
  }
  rename(name: string) {
    return this.authed((me) => this.core.rename(me, name));
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
  leaderboard(limit = 50, board?: LeaderboardBoard) {
    return this.authed((me) => this.core.leaderboard(me, limit, board));
  }
  candidates(offense?: number) {
    return this.authed((me) => this.core.candidates(me, offense));
  }
  matchWith(req: MatchRequest) {
    return this.authed((me) => this.core.matchWith(me, wire(req)));
  }
  setPvp(optIn: boolean) {
    return this.authed((me) => this.core.setPvp(me, optIn));
  }
  setFaction(clan: string | null) {
    return this.authed((me) => this.core.setFaction(me, clan));
  }
  world() {
    return this.authed((me) => this.core.world(me));
  }
  submitTournament(sub: TournamentSubmission) {
    return this.authed((me) => this.core.submitTournament(me, wire(sub)));
  }
  tournament(limit = 20) {
    return this.authed((me) => this.core.tournament(me, limit));
  }
  metrics() {
    return this.call(() => this.core.metrics());
  }
  claimSettlement(settlement: string) {
    return this.authed((me) => this.core.claimSettlement(me, settlement));
  }
  releaseSettlement(settlement: string) {
    return this.authed((me) => this.core.releaseSettlement(me, settlement));
  }
  setFactionTarget(target: string) {
    return this.authed((me) => this.core.setFactionTarget(me, target));
  }
  allianceBoard(limit = 50) {
    return this.authed((me) => this.core.allianceBoard(me, limit));
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
