-- =============================================================================
-- 004: multi-story hardening, secure messaging, music library
--
-- Idempotent: safe to run more than once, and safe on top of schema.sql +
-- 002 + 003. Run it in the Supabase SQL editor (as the default `postgres` role).
--
-- Findings this migration addresses (see README "What changed" for context):
--   * stories had NO one-per-user constraint (multiple stories were already
--     legal in the DB) - the "only one story" bug was UI-only. We still harden
--     the insert policy so a client cannot set an arbitrary expiry.
--   * getOrCreateDirectConversation did `insert ... returning` on
--     conversations, but the SELECT policy requires membership, which doesn't
--     exist yet at that instant -> RLS error -> Message buttons did nothing.
--     Conversation creation now goes through a SECURITY DEFINER RPC.
--   * conversation_members INSERT was `auth.uid() is not null`, i.e. ANY user
--     could add THEMSELVES to ANY conversation and read its messages. Removed:
--     all membership writes now go through the RPC.
--   * conversation_members / messages UPDATE allowed changing any column
--     (e.g. moving a message to another conversation). Restricted with
--     column-level grants.
--   * Music: uploads were validated as image/video so audio always failed, and
--     there was no audio bucket / catalog. Adds `audio` bucket + `audio_tracks`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. STORIES
-- -----------------------------------------------------------------------------
create index if not exists idx_stories_user_created on public.stories(user_id, created_at);

-- Owner decides content, but not an arbitrary lifetime (max 24h + clock skew).
drop policy if exists "stories_insert_own" on public.stories;
create policy "stories_insert_own" on public.stories for insert
  with check (
    auth.uid() = user_id
    and expires_at <= now() + interval '25 hours'
    and expires_at > now()
  );

-- Physically purge expired stories hourly when pg_cron is available. Reads are
-- already protected by the `expires_at > now()` clause in stories_select, so
-- this is housekeeping only. Skipped silently if pg_cron can't be enabled.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('smg-delete-expired-stories', '17 * * * *', 'select public.delete_expired_stories()');
    perform cron.schedule('smg-delete-expired-notes', '19 * * * *', 'select public.delete_expired_notes()');
  end if;
exception when others then
  raise notice 'pg_cron not enabled (%), expired stories are still hidden by RLS', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 2. MESSAGING
-- -----------------------------------------------------------------------------

-- 2a. Create / find a 1:1 conversation atomically and safely.
create or replace function public.get_or_create_direct_conversation(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me   uuid := auth.uid();
  conv uuid;
begin
  if me is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if other_user is null or other_user = me then
    raise exception 'Invalid recipient' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = other_user) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.blocked_users
    where (blocker_id = me and blocked_id = other_user)
       or (blocker_id = other_user and blocked_id = me)
  ) then
    raise exception 'You cannot message this account' using errcode = '42501';
  end if;

  -- serialise concurrent "open chat" clicks between the same two people
  perform pg_advisory_xact_lock(hashtext(least(me::text, other_user::text) || greatest(me::text, other_user::text)));

  select c.id into conv
  from public.conversations c
  where not c.is_group
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = me)
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = other_user)
    and (select count(*) from public.conversation_members m where m.conversation_id = c.id) = 2
  order by c.created_at
  limit 1;

  if conv is not null then
    return conv;
  end if;

  insert into public.conversations (is_group) values (false) returning id into conv;
  insert into public.conversation_members (conversation_id, user_id) values (conv, me), (conv, other_user);
  return conv;
end;
$$;

-- 2b. Read-state helpers (server clock, no N+1 queries from the client).
create or replace function public.mark_conversation_read(conv uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.conversation_members
     set last_read_at = now()
   where conversation_id = conv and user_id = auth.uid();
$$;

create or replace function public.get_unread_counts()
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select m.conversation_id, count(msg.id) as unread_count
  from public.conversation_members m
  left join public.messages msg
    on msg.conversation_id = m.conversation_id
   and msg.sender_id <> m.user_id
   and msg.deleted_at is null
   and msg.created_at > m.last_read_at
  where m.user_id = auth.uid()
  group by m.conversation_id;
$$;

create or replace function public.get_last_messages()
returns setof public.messages
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (msg.conversation_id) msg.*
  from public.messages msg
  where msg.conversation_id in (
    select cm.conversation_id from public.conversation_members cm where cm.user_id = auth.uid()
  )
  order by msg.conversation_id, msg.created_at desc;
$$;

revoke all on function public.get_or_create_direct_conversation(uuid) from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.get_unread_counts() from public, anon;
revoke all on function public.get_last_messages() from public, anon;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.get_unread_counts() to authenticated;
grant execute on function public.get_last_messages() to authenticated;

-- 2c. Lock down direct writes. Conversations and memberships are only created
-- through the RPC above; nobody can add themselves (or anyone) to a thread.
drop policy if exists "conversations_insert" on public.conversations;
drop policy if exists "conv_members_insert" on public.conversation_members;
drop policy if exists "conversations_update_member" on public.conversations;

drop policy if exists "conv_members_update_own" on public.conversation_members;
create policy "conv_members_update_own" on public.conversation_members for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Column-level privileges: members may only touch their own read marker, and a
-- sender may only soft-delete / edit the body of their own message.
revoke update on public.conversation_members from authenticated, anon;
grant update (last_read_at) on public.conversation_members to authenticated;

revoke update on public.messages from authenticated, anon;
grant update (content, deleted_at) on public.messages to authenticated;

revoke insert, delete on public.conversations from authenticated, anon;
revoke update on public.conversations from authenticated, anon;

drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages for update
  using (auth.uid() = sender_id) with check (auth.uid() = sender_id);

-- Message content bounds (also stops multi-MB text payloads).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_content_length') then
    alter table public.messages
      add constraint messages_content_length check (char_length(coalesce(content, '')) <= 4000) not valid;
  end if;
end $$;

-- Online status is only visible to yourself and people you share a chat with.
drop policy if exists "presence_select_all" on public.presence;
drop policy if exists "presence_select_related" on public.presence;
create policy "presence_select_related" on public.presence for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.conversation_members a
      join public.conversation_members b on b.conversation_id = a.conversation_id
      where a.user_id = auth.uid() and b.user_id = presence.user_id
    )
  );

-- Realtime: also publish read-receipts (conversation_members.last_read_at).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members'
  ) then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. MUSIC LIBRARY
-- -----------------------------------------------------------------------------
create table if not exists public.audio_tracks (
  id               uuid primary key default uuid_generate_v4(),
  owner_id         uuid references public.profiles(id) on delete cascade,  -- null for curated library tracks
  title            text not null check (char_length(title) between 1 and 100),
  artist           text not null default '' check (char_length(artist) <= 100),
  audio_url        text not null,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 3600),
  mime_type        text,
  size_bytes       bigint check (size_bytes is null or size_bytes <= 20971520),
  license          text not null default 'user-owned',
  source           text not null default 'upload' check (source in ('upload', 'library')),
  is_public        boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists idx_audio_tracks_owner on public.audio_tracks(owner_id, created_at desc);
create index if not exists idx_audio_tracks_public on public.audio_tracks(is_public, title);
create unique index if not exists uq_audio_tracks_library_title on public.audio_tracks(title) where source = 'library';

alter table public.audio_tracks enable row level security;

drop policy if exists "audio_tracks_select" on public.audio_tracks;
create policy "audio_tracks_select" on public.audio_tracks for select
  using (is_public or owner_id = auth.uid());

-- Users can only register tracks they uploaded themselves into their own folder
-- of the `audio` bucket; they can never create/modify curated library rows.
drop policy if exists "audio_tracks_insert_own" on public.audio_tracks;
create policy "audio_tracks_insert_own" on public.audio_tracks for insert
  with check (
    owner_id = auth.uid()
    and source = 'upload'
    and is_public = false
    and audio_url like '%/storage/v1/object/public/audio/' || auth.uid()::text || '/%'
  );

drop policy if exists "audio_tracks_update_own" on public.audio_tracks;
create policy "audio_tracks_update_own" on public.audio_tracks for update
  using (owner_id = auth.uid() and source = 'upload')
  with check (owner_id = auth.uid() and source = 'upload' and is_public = false);

drop policy if exists "audio_tracks_delete_own" on public.audio_tracks;
create policy "audio_tracks_delete_own" on public.audio_tracks for delete
  using (owner_id = auth.uid() and source = 'upload');

revoke update on public.audio_tracks from authenticated, anon;
grant update (title, artist) on public.audio_tracks to authenticated;

-- A reel/post remembers which track (if any) it uses. audio_url/audio_title stay
-- on the post so playback never depends on the catalog row still existing.
alter table public.posts add column if not exists audio_artist text not null default '';
alter table public.posts add column if not exists audio_track_id uuid references public.audio_tracks(id) on delete set null;

-- Starter royalty-free library: original loops generated for SMG by
-- scripts/generate-audio.mjs (CC0). Served from /audio/*.wav by the app itself.
-- To add a real catalogue later, insert rows here with source = 'library',
-- is_public = true and an https audio_url - no client changes needed.
insert into public.audio_tracks (title, artist, audio_url, duration_seconds, mime_type, license, source, is_public) values
  ('Sunrise Loop',   'SMG Originals', '/audio/sunrise-loop.wav',   13, 'audio/wav', 'CC0', 'library', true),
  ('Neon Drive',     'SMG Originals', '/audio/neon-drive.wav',     12, 'audio/wav', 'CC0', 'library', true),
  ('Lo-fi Window',   'SMG Originals', '/audio/lofi-window.wav',    12, 'audio/wav', 'CC0', 'library', true),
  ('Calm Waters',    'SMG Originals', '/audio/calm-waters.wav',    11, 'audio/wav', 'CC0', 'library', true),
  ('Street Pulse',   'SMG Originals', '/audio/street-pulse.wav',   12, 'audio/wav', 'CC0', 'library', true),
  ('Golden Hour',    'SMG Originals', '/audio/golden-hour.wav',    11, 'audio/wav', 'CC0', 'library', true)
on conflict (title) where source = 'library' do nothing;

-- -----------------------------------------------------------------------------
-- 4. STORAGE: audio bucket + server-side type/size limits + policies
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('audio', 'audio', true)
on conflict (id) do nothing;

-- Enforced by Storage itself, regardless of what a tampered client sends.
update storage.buckets set
  file_size_limit = 15728640,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
where id = 'avatars';

update storage.buckets set
  file_size_limit = 104857600,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
where id in ('posts', 'stories', 'messages');

update storage.buckets set
  file_size_limit = 20971520,
  allowed_mime_types = array['audio/mpeg','audio/mp3','audio/mp4','audio/m4a','audio/x-m4a','audio/wav','audio/x-wav','audio/wave','audio/ogg']
where id = 'audio';

drop policy if exists "storage_public_read" on storage.objects;
create policy "storage_public_read" on storage.objects for select
  using (bucket_id in ('avatars','posts','stories','messages','audio'));

drop policy if exists "storage_owner_write" on storage.objects;
create policy "storage_owner_write" on storage.objects for insert
  with check (
    bucket_id in ('avatars','posts','stories','messages','audio')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "storage_owner_update" on storage.objects;
create policy "storage_owner_update" on storage.objects for update
  using (
    bucket_id in ('avatars','posts','stories','messages','audio')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "storage_owner_delete" on storage.objects;
create policy "storage_owner_delete" on storage.objects for delete
  using (
    bucket_id in ('avatars','posts','stories','messages','audio')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
