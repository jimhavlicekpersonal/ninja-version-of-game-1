import { describe, expect, it } from 'vitest';
import { ServerPush, type PushMessage } from '../../../server/push/push';
import { world } from './harness';
import { PRESET_CHAT } from '../../../src/backend/net/protocol';

describe('locale metadata at owned delivery boundaries', () => {
  it('keeps an adult’s matching free-text chat literal and marks only validated under-13 presets', async () => {
    const w=world();const adult=await w.player('Ada');await adult.stateAge({band:'adult'});
    const grove=await adult.createGrove('Garden');
    const minor=await w.player('Generated');await minor.stateAge({band:'under13'});await minor.joinGrove(grove.id);
    expect(await adult.postChat(PRESET_CHAT[0])).not.toHaveProperty('presetId');
    expect(await minor.postChat(PRESET_CHAT[0])).toMatchObject({text:'Hello!',presetId:0});
    await expect(minor.postChat('Arbitrary text')).rejects.toMatchObject({code:'age_restricted'});
    const rows=(await w.repo.chatAfter(grove.id, 0, 50)).filter(r=>r.kind==='chat');
    expect(rows.map(r=>r.presetId)).toEqual([undefined,0]);
  });
  it('sends Spanish and English to separate devices without renaming the actor or mutating the message', async () => {
    const w=world();const p=await w.player('沙織');
    const messages: {token:string;m:PushMessage}[]=[];
    const push=new ServerPush({repo:w.repo,data:w.data,now:w.now,transport:{platforms:['ios','android'],send:async(_platform,token,m)=>{messages.push({token,m});return 'sent';}}});
    await p.putPushToken({token:'a'.repeat(64),platform:'ios',types:['friends'],tzOffsetMinutes:0,locale:'es'});
    await p.putPushToken({token:'b'.repeat(64),platform:'android',types:['friends'],tzOffsetMinutes:0,locale:'en'});
    const original={type:'friends',title:'沙織 wants to be friends',body:'Open Friends to answer.'};
    expect(await push.deliver(p.id,original)).toEqual(['sent','sent']);
    expect(messages.map(s=>s.m.title)).toEqual(['沙織 quiere ser tu amigo','沙織 wants to be friends']);
    expect(messages[0].m.body).toBe('Abre Amigos para responder.');
    expect(original.title).toBe('沙織 wants to be friends');
  });
});
