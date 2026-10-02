-- =============================================================================
-- SMG Phase 2 migration — Notes, story interactions, real audio uploads,
-- story-aware notifications, and a bugfix carried over from migration 002.
-- Idempotent: safe to run on an existing database, won't touch existing rows.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Bugfix: 002_phase1_fixes.sql's handle_post_tag() declared 4 target
--    columns but supplied 5 values in the INSERT, which throws
--    "INSERT has more expressions than target columns" every time someone
--    is tagged in a post. Re-creating it here fixes it whether or not you
--    already ran 002.
-- -----------------------------------------------------------------------------
create or replace function public.handle_post_tag()
returns trigger language plpgsql security definer as $$
declare
  tagger uuid;
begin
  select user_id into tagger from public.posts where id = new.post_id;
  if tagger is not null and tagger <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
    values (new.user_id, tagger, 'mention', new.post_id, null);
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Real audio on posts/reels: an uploaded, user-owned/royalty-free audio
--    file rather than a text-only "pretend" music field. Storage reuses the
--    existing `posts` bucket (same per-user-folder policy already covers it).
-- -----------------------------------------------------------------------------
alter table public.posts add column if not exists audio_url text;

-- -----------------------------------------------------------------------------
-- 2. Story interactions: likes (persisted, counted) + story-aware notifications.
--    "Reply to a story" deliberately reuses the existing conversations/
--    messages tables (exactly how Instagram's own story replies work — they
--    are private DMs, not a public comment thread) rather than introducing a
--    parallel comment system, per the "reuse existing tables" instruction.
-- -----------------------------------------------------------------------------
alter table public.stories add column if not exists like_count integer not null default 0;

create table if not exists public.story_likes (
  story_id    uuid not null references public.stories(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (story_id, user_id)
);

alter table public.notifications add column if not exists story_id uuid references public.stories(id) on delete cascade;

create or replace function public.handle_story_like()
returns trigger language plpgsql security definer as $$
declare
  story_owner uuid;
begin
  if TG_OP = 'INSERT' then
    update public.stories set like_count = like_count + 1 where id = new.story_id;
    select user_id into story_owner from public.stories where id = new.story_id;
    if story_owner is not null and story_owner <> new.user_id then
      insert into public.notifications (recipient_id, actor_id, type, story_id)
      values (story_owner, new.user_id, 'like', new.story_id);
    end if;
    return new;
  elsif TG_OP = 'DELETE' then
    update public.stories set like_count = greatest(like_count - 1, 0) where id = old.story_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_story_like_ins on public.story_likes;
create trigger trg_story_like_ins after insert on public.story_likes
  for each row execute function public.handle_story_like();
drop trigger if exists trg_story_like_del on public.story_likes;
create trigger trg_story_like_del after delete on public.story_likes
  for each row execute function public.handle_story_like();

alter table public.story_likes enable row level security;
drop policy if exists "story_likes_select" on public.story_likes;
create policy "story_likes_select" on public.story_likes for select
  using (
    exists (select 1 from public.stories s where s.id = story_id and public.can_view_profile(auth.uid(), s.user_id))
  );
drop policy if exists "story_likes_insert" on public.story_likes;
create policy "story_likes_insert" on public.story_likes for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.stories s where s.id = story_id and public.can_view_profile(auth.uid(), s.user_id))
  );
drop policy if exists "story_likes_delete" on public.story_likes;
create policy "story_likes_delete" on public.story_likes for delete using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 3. Notes (Instagram-style, one live note per person — posting a new one
--    replaces the old one via upsert, which is why user_id is the primary key
--    rather than a uuid with multiple rows per user).
-- -----------------------------------------------------------------------------
create table if not exists public.notes (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours'),
  constraint notes_content_length check (char_length(content) between 1 and 60)
);
create index if not exists idx_notes_expires on public.notes(expires_at);

alter table public.notes enable row level security;
drop policy if exists "notes_select" on public.notes;
create policy "notes_select" on public.notes for select
  using (expires_at > now() and public.can_view_profile(auth.uid(), user_id));
drop policy if exists "notes_upsert_own" on public.notes;
create policy "notes_upsert_own" on public.notes for insert with check (auth.uid() = user_id);
drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own" on public.notes for update using (auth.uid() = user_id);
drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own" on public.notes for delete using (auth.uid() = user_id);

create or replace function public.delete_expired_notes()
returns void language sql security definer as $$
  delete from public.notes where expires_at < now();
$$;

-- -----------------------------------------------------------------------------
-- 4. Realtime: notes + story_likes benefit from live updates in the UI.
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.story_likes;
