-- Security fixes 2026-11-24 (SECR-02). Additive.
--
-- Each raid staff reversed (POST /admin/v1/players/:id/reverse-raids), written in the
-- same transaction as the honor it gave back, so a raid is reversed once however many
-- staff actions follow (they used to be found in the last 200 staff log rows only).
-- No player id: the attack id alone. Pruned after the longest reversal window.
create table if not exists reversed_attacks (
  attack_id text primary key,
  reversed_at bigint not null
);
create index if not exists reversed_attacks_at on reversed_attacks (reversed_at);
-- Raids reversed by earlier builds (their ids are in the staff log).
insert into reversed_attacks (attack_id, reversed_at)
select a.id, s.at
from staff_actions s
cross join lateral jsonb_array_elements_text(case when jsonb_typeof(s.detail->'attacks') = 'array' then s.detail->'attacks' else '[]'::jsonb end) as a(id)
where s.action = 'reverse-raids'
on conflict (attack_id) do nothing;
