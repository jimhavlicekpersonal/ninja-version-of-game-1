/**
 * The server core: every multiplayer rule, independent of HTTP and of the
 * database. server/app.ts puts it behind HTTP; server/inProcess.ts calls it
 * directly. A future server can reuse it with other adapters.
 */
import * as account from './account';
import * as age from './age';
import * as admin from './admin';
import type { ServerContext } from './context';
import * as duels from './duels';
import * as friends from './friends';
import * as gangWars from './gangWars';
import * as squads from './squads';
import * as groves from './groves';
import * as names from './names';
import * as groveRaid from './groveRaid';
import * as identity from './identity';
import * as links from './links';
import * as moderation from './moderation';
import * as purchases from './purchases';
import * as pushTokens from './pushTokens';
import * as pvp from './pvp';
import * as retention from './retention';
import * as village from './village';
import * as villageImport from './villageImport';

export type { ServerContext } from './context';
export { ApiError } from './context';

export function createCore(ctx: ServerContext) {
  return {
    ctx,
    hello: () => identity.hello(ctx),
    balance: () => identity.balance(ctx),
    register: (name: unknown) => identity.register(ctx, name),
    authenticate: (token: string | undefined) => identity.authenticate(ctx, token),
    me: (p: Parameters<typeof identity.playerView>[0]) => identity.playerView(p, ctx.now()),
    rename: identity.rename.bind(null, ctx),
    deleteAccount: account.deleteAccount.bind(null, ctx),
    friends: friends.friends.bind(null, ctx),
    lookupPlayer: friends.lookup.bind(null, ctx),
    playerByCode: friends.byCode.bind(null, ctx),
    friendRequest: friends.request.bind(null, ctx),
    answerFriendRequest: friends.answer.bind(null, ctx),
    cancelFriendRequest: friends.cancel.bind(null, ctx),
    unfriend: friends.unfriend.bind(null, ctx),
    setPrivacy: friends.setPrivacy.bind(null, ctx),
    platformFriends: friends.platformFriends.bind(null, ctx),
    duelTicket: duels.duelTicket.bind(null, ctx),
    reportDuel: duels.reportDuel.bind(null, ctx),
    duels: duels.duels.bind(null, ctx),
    setDuelLayout: duels.setDuelLayout.bind(null, ctx),
    challenge: duels.challenge.bind(null, ctx),
    challenges: duels.challenges.bind(null, ctx),
    squad: squads.mySquad.bind(null, ctx),
    createSquad: squads.createSquad.bind(null, ctx),
    squadInvite: squads.invite.bind(null, ctx),
    answerSquadInvite: squads.answerInvite.bind(null, ctx),
    leaveSquad: (me: Parameters<typeof squads.leave>[1]) => squads.leave(ctx, me),
    squadLeader: squads.handOver.bind(null, ctx),
    squadChat: squads.chat.bind(null, ctx),
    postSquadChat: squads.postChat.bind(null, ctx),
    squadRequests: squads.requests.bind(null, ctx),
    squadRequestTroops: squads.requestTroops.bind(null, ctx),
    squadDonate: squads.donate.bind(null, ctx),
    gangWar: gangWars.war.bind(null, ctx),
    gangWarQueue: gangWars.queue.bind(null, ctx),
    gangWarCancel: gangWars.cancelQueue.bind(null, ctx),
    gangWarBase: gangWars.refreshBase.bind(null, ctx),
    gangWarTicket: gangWars.warTicket.bind(null, ctx),
    gangWarAttack: gangWars.warAttack.bind(null, ctx),
    gangWarClaim: gangWars.claim.bind(null, ctx),
    /** Every few minutes: battle-day and 2-hours-left pushes (step 68). */
    gangWarReminders: () => gangWars.gangWarReminders(ctx),
    /** Start-up: give players from before unique names their name key (step 59). */
    migrateNames: () => names.migrateNames(ctx),
    links: links.links.bind(null, ctx),
    link: links.link.bind(null, ctx),
    unlink: links.unlink.bind(null, ctx),
    signIn: links.signIn.bind(null, ctx),
    /** Re-audit: account protections (age bands, deletion codes, notices, sessions, Sign in with Apple notifications). */
    stateAge: age.stateAge.bind(null, ctx),
    deletionCode: account.deletionCode.bind(null, ctx),
    notices: moderation.notices.bind(null, ctx),
    markNoticesRead: moderation.markNoticesRead.bind(null, ctx),
    revokeOtherSessions: links.revokeOthers.bind(null, ctx),
    appleSignInNotification: (body: { payload?: unknown } | undefined) => links.appleSignInNotification(ctx, body, (p) => account.deleteAccount(ctx, p)),
    /** Hourly with retention: extra device tokens unused for 400 days. */
    pruneTokens: () => links.pruneTokens(ctx),
    getVillage: village.getVillage.bind(null, ctx),
    startVillage: village.startVillage.bind(null, ctx),
    importVillage: villageImport.importVillage.bind(null, ctx),
    villageCommands: village.applyCommands.bind(null, ctx),
    ledger: village.ledger.bind(null, ctx),
    report: moderation.report.bind(null, ctx),
    block: moderation.block.bind(null, ctx),
    unblock: moderation.unblock.bind(null, ctx),
    blocks: moderation.blocks.bind(null, ctx),
    requestDeletion: account.requestDeletion.bind(null, ctx),
    purchaseIntent: purchases.purchaseIntent.bind(null, ctx),
    releaseIntent: purchases.releaseIntent.bind(null, ctx),
    redeem: purchases.redeem.bind(null, ctx),
    purchaseHistory: purchases.purchaseHistory.bind(null, ctx),
    appleNotification: purchases.appleNotification.bind(null, ctx),
    googleNotification: purchases.googleNotification.bind(null, ctx),
    /** Hourly: Google's Voided Purchases API since `since`. */
    pollVoided: purchases.pollVoided.bind(null, ctx),
    putPushToken: pushTokens.putPushToken.bind(null, ctx),
    deletePushToken: pushTokens.deletePushToken.bind(null, ctx),
    uploadBase: pvp.uploadBase.bind(null, ctx),
    match: pvp.match.bind(null, ctx),
    attack: pvp.attack.bind(null, ctx),
    startAttack: pvp.startAttack.bind(null, ctx),
    voidAttack: pvp.voidAttack.bind(null, ctx),
    defenses: pvp.defenses.bind(null, ctx),
    leaderboard: pvp.leaderboard.bind(null, ctx),
    powerLeaderboard: pvp.powerLeaderboard.bind(null, ctx),
    listGroves: groves.listGroves.bind(null, ctx),
    createGrove: groves.createGrove.bind(null, ctx),
    joinGrove: groves.joinGrove.bind(null, ctx),
    leaveGrove: groves.leaveGrove.bind(null, ctx),
    myGrove: groves.myGrove.bind(null, ctx),
    chat: groves.chat.bind(null, ctx),
    postChat: groves.postChat.bind(null, ctx),
    requests: groves.requests.bind(null, ctx),
    requestTroops: groves.requestTroops.bind(null, ctx),
    donate: groves.donate.bind(null, ctx),
    inbox: groves.inbox.bind(null, ctx),
    ackInbox: groves.ackInbox.bind(null, ctx),
    raid: groveRaid.raid.bind(null, ctx),
    raidTicket: groveRaid.raidTicket.bind(null, ctx),
    raidAttack: groveRaid.raidAttack.bind(null, ctx),
    claimRaid: groveRaid.claimRaid.bind(null, ctx),
    /** Retention: old replays, tickets and unreferenced base versions. */
    prune: () => retention.prune(ctx),
    /** Staff only (the admin API in server/app.ts). */
    admin: {
      deletionQueue: account.deletionQueue.bind(null, ctx),
      resolveDeletion: account.resolveDeletion.bind(null, ctx),
      reportQueue: moderation.reportQueue.bind(null, ctx),
      resolveReport: moderation.resolveReport.bind(null, ctx),
      search: admin.search.bind(null, ctx),
      player: admin.detail.bind(null, ctx),
      adjust: admin.adjust.bind(null, ctx),
      ban: admin.ban.bind(null, ctx),
      resetRating: admin.resetRating.bind(null, ctx),
      resetAge: admin.resetAge.bind(null, ctx),
      actions: admin.actions.bind(null, ctx),
    },
  };
}

export type ServerCore = ReturnType<typeof createCore>;
