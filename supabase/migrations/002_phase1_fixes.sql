-- =============================================================================
-- SMG Phase 1 migration
-- Safe to run once on your existing project. Uses IF NOT EXISTS / CREATE OR
-- REPLACE / DROP POLICY IF EXISTS throughout, so it won't touch existing data
-- and can be re-run without side effects.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fix infinite-recursion RLS bug on conversations (already sent separately,
--    included here so schema.sql and your live DB stay in sync).
-- -----------------------------------------------------------------------------
create or replace function public.is_conversation_member(conv_id uuid, uid uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv_id and user_id = uid
  );
$$;

drop policy if exists "conversations_select_member" on public.conversations;
create policy "conversations_select_member" on public.conversations for select
  using (public.is_conversation_member(id, auth.uid()));

drop policy if exists "conversations_update_member" on public.conversations;
create policy "conversations_update_member" on public.conversations for update
  using (public.is_conversation_member(id, auth.uid()));

drop policy if exists "conv_members_select" on public.conversation_members;
create policy "conv_members_select" on public.conversation_members for select
  using (public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "messages_select_member" on public.messages;
create policy "messages_select_member" on public.messages for select
  using (public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "messages_insert_member" on public.messages;
create policy "messages_insert_member" on public.messages for insert
  with check (auth.uid() = sender_id and public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "typing_status_select_member" on public.typing_status;
create policy "typing_status_select_member" on public.typing_status for select
  using (public.is_conversation_member(conversation_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 2. Reel cover images: a dedicated column so we never render a black box.
-- -----------------------------------------------------------------------------
alter table public.posts add column if not exists cover_url text;

-- -----------------------------------------------------------------------------
-- 3. Tag/mention notifications: the `mentions` table existed but nothing ever
--    turned a row into a notification. Add that here (covers both post
--    captions and comments).
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_mention()
returns trigger language plpgsql security definer as $$
begin
  if new.mentioned_user <> new.mentioned_by then
    insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
    values (new.mentioned_user, new.mentioned_by, 'mention', new.post_id, new.comment_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mention_ins on public.mentions;
create trigger trg_mention_ins after insert on public.mentions
  for each row execute function public.handle_new_mention();

-- Tagged-in-photo notifications (post_tagged_users) are a distinct concept
-- from @mentions in captions/comments, so they get their own notification path.
create or replace function public.handle_post_tag()
returns trigger language plpgsql security definer as $$
declare
  tagger uuid;
begin
  select user_id into tagger from public.posts where id = new.post_id;
  if tagger is not null and tagger <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    values (new.user_id, tagger, 'mention', new.post_id, null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_post_tag_ins on public.post_tagged_users;
create trigger trg_post_tag_ins after insert on public.post_tagged_users
  for each row execute function public.handle_post_tag();

-- -----------------------------------------------------------------------------
-- 4. Reel deep-link support: nothing schema-side needed (posts.id already
--    works as the identifier), this is a frontend routing fix — see app code.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 5. Helpful index for tag lookups used by the edit-post flow.
-- -----------------------------------------------------------------------------
create index if not exists idx_post_tagged_users_user on public.post_tagged_users(user_id);
