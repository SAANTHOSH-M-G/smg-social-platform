-- =============================================================================
-- SMG — full database schema for Supabase (PostgreSQL)
-- Run this once in the Supabase SQL editor on a fresh project.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.
-- =============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;

-- =============================================================================
-- ENUM TYPES
-- =============================================================================
do $$ begin
  create type post_media_type as enum ('image', 'video');
exception when duplicate_object then null; end $$;

do $$ begin
  create type follow_request_status as enum ('pending', 'accepted', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_type as enum (
    'like', 'comment', 'comment_reply', 'follow', 'follow_request',
    'follow_accepted', 'mention', 'message'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_target_type as enum ('post', 'comment', 'user', 'story');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- PROFILES  (1:1 with auth.users)
-- =============================================================================
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  username          text not null unique,
  full_name         text default '',
  bio               text default '',
  website           text default '',
  avatar_url        text default '',
  is_private        boolean not null default false,
  followers_count   integer not null default 0,
  following_count   integer not null default 0,
  posts_count       integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint username_format check (username ~ '^[a-z0-9_.]{3,30}$')
);

create index if not exists idx_profiles_username_trgm on public.profiles using gin (username gin_trgm_ops);

-- =============================================================================
-- POSTS
-- =============================================================================
create table if not exists public.posts (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  caption       text default '',
  location     text default '',
  is_reel       boolean not null default false,
  audio_title  text default '',
  cover_url     text,
  audio_url     text,
  like_count    integer not null default 0,
  comment_count integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_posts_user_id on public.posts(user_id);
create index if not exists idx_posts_created_at on public.posts(created_at desc);
create index if not exists idx_posts_is_reel on public.posts(is_reel);

create table if not exists public.post_media (
  id          uuid primary key default uuid_generate_v4(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  media_url   text not null,
  media_type  post_media_type not null default 'image',
  position    integer not null default 0,
  width       integer,
  height      integer
);
create index if not exists idx_post_media_post_id on public.post_media(post_id, position);

create table if not exists public.post_tagged_users (
  post_id  uuid not null references public.posts(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (post_id, user_id)
);
create index if not exists idx_post_tagged_users_user on public.post_tagged_users(user_id);

-- =============================================================================
-- HASHTAGS
-- =============================================================================
create table if not exists public.hashtags (
  id     uuid primary key default uuid_generate_v4(),
  tag    text not null unique
);

create table if not exists public.post_hashtags (
  post_id     uuid not null references public.posts(id) on delete cascade,
  hashtag_id  uuid not null references public.hashtags(id) on delete cascade,
  primary key (post_id, hashtag_id)
);

-- =============================================================================
-- LIKES
-- =============================================================================
create table if not exists public.post_likes (
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- =============================================================================
-- COMMENTS
-- =============================================================================
create table if not exists public.comments (
  id                uuid primary key default uuid_generate_v4(),
  post_id           uuid not null references public.posts(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  content           text not null,
  like_count        integer not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists idx_comments_post_id on public.comments(post_id, created_at);
create index if not exists idx_comments_parent on public.comments(parent_comment_id);

create table if not exists public.comment_likes (
  comment_id  uuid not null references public.comments(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- =============================================================================
-- MENTIONS
-- =============================================================================
create table if not exists public.mentions (
  id            uuid primary key default uuid_generate_v4(),
  post_id       uuid references public.posts(id) on delete cascade,
  comment_id    uuid references public.comments(id) on delete cascade,
  mentioned_by  uuid not null references public.profiles(id) on delete cascade,
  mentioned_user uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now()
);

-- =============================================================================
-- FOLLOWS + FOLLOW REQUESTS
-- =============================================================================
create table if not exists public.follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);
create index if not exists idx_follows_following on public.follows(following_id);

create table if not exists public.follow_requests (
  id            uuid primary key default uuid_generate_v4(),
  requester_id  uuid not null references public.profiles(id) on delete cascade,
  target_id     uuid not null references public.profiles(id) on delete cascade,
  status        follow_request_status not null default 'pending',
  created_at    timestamptz not null default now(),
  unique (requester_id, target_id)
);

-- =============================================================================
-- SAVED POSTS
-- =============================================================================
create table if not exists public.saved_posts (
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- =============================================================================
-- STORIES
-- =============================================================================
create table if not exists public.stories (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  media_url   text not null,
  media_type  post_media_type not null default 'image',
  caption     text default '',
  like_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours')
);
create index if not exists idx_stories_user_id on public.stories(user_id);
create index if not exists idx_stories_expires on public.stories(expires_at);

create table if not exists public.story_views (
  story_id    uuid not null references public.stories(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  viewed_at   timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table if not exists public.story_likes (
  story_id    uuid not null references public.stories(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (story_id, user_id)
);

-- Instagram-style Notes: one live note per person. A new note replaces the
-- old one (client upserts on user_id), which is why user_id is the primary
-- key rather than a uuid with multiple rows per user.
create table if not exists public.notes (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours'),
  constraint notes_content_length check (char_length(content) between 1 and 60)
);
create index if not exists idx_notes_expires on public.notes(expires_at);

-- =============================================================================
-- BLOCKED USERS + REPORTS
-- =============================================================================
create table if not exists public.blocked_users (
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create table if not exists public.reports (
  id            uuid primary key default uuid_generate_v4(),
  reporter_id   uuid not null references public.profiles(id) on delete cascade,
  target_type   report_target_type not null,
  target_id     uuid not null,
  reason        text not null,
  created_at    timestamptz not null default now()
);

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================
create table if not exists public.notifications (
  id            uuid primary key default uuid_generate_v4(),
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  actor_id      uuid references public.profiles(id) on delete cascade,
  type          notification_type not null,
  post_id       uuid references public.posts(id) on delete cascade,
  comment_id    uuid references public.comments(id) on delete cascade,
  story_id      uuid references public.stories(id) on delete cascade,
  is_read       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_notifications_recipient on public.notifications(recipient_id, created_at desc);

-- =============================================================================
-- CONVERSATIONS + MESSAGES
-- =============================================================================
create table if not exists public.conversations (
  id            uuid primary key default uuid_generate_v4(),
  is_group      boolean not null default false,
  title         text,
  created_at    timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  joined_at        timestamptz not null default now(),
  last_read_at     timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id                uuid primary key default uuid_generate_v4(),
  conversation_id   uuid not null references public.conversations(id) on delete cascade,
  sender_id         uuid not null references public.profiles(id) on delete cascade,
  content           text default '',
  media_url         text,
  media_type        post_media_type,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at);

create table if not exists public.typing_status (
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  updated_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.presence (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  is_online   boolean not null default false,
  last_seen   timestamptz not null default now()
);

-- =============================================================================
-- FUNCTIONS + TRIGGERS  (counters, timestamps, notifications)
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_posts_updated_at on public.posts;
create trigger trg_posts_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

-- New auth user -> create profile row
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;
  insert into public.presence(user_id, is_online) values (new.id, true)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Post like count
create or replace function public.handle_post_like()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    select p.user_id, new.user_id, 'like', new.post_id
    from public.posts p where p.id = new.post_id and p.user_id <> new.user_id;
    return new;
  elsif TG_OP = 'DELETE' then
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_post_like_ins on public.post_likes;
create trigger trg_post_like_ins after insert on public.post_likes
  for each row execute function public.handle_post_like();
drop trigger if exists trg_post_like_del on public.post_likes;
create trigger trg_post_like_del after delete on public.post_likes
  for each row execute function public.handle_post_like();

-- Comment count + notifications (top-level vs reply)
create or replace function public.handle_new_comment()
returns trigger language plpgsql security definer as $$
declare
  post_owner uuid;
  parent_owner uuid;
begin
  update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  select user_id into post_owner from public.posts where id = new.post_id;

  if new.parent_comment_id is not null then
    select user_id into parent_owner from public.comments where id = new.parent_comment_id;
    if parent_owner is not null and parent_owner <> new.user_id then
      insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
      values (parent_owner, new.user_id, 'comment_reply', new.post_id, new.id);
    end if;
  elsif post_owner <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
    values (post_owner, new.user_id, 'comment', new.post_id, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_comment_ins on public.comments;
create trigger trg_comment_ins after insert on public.comments
  for each row execute function public.handle_new_comment();

create or replace function public.handle_comment_delete()
returns trigger language plpgsql security definer as $$
begin
  update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  return old;
end;
$$;

drop trigger if exists trg_comment_del on public.comments;
create trigger trg_comment_del after delete on public.comments
  for each row execute function public.handle_comment_delete();

-- Comment like count
create or replace function public.handle_comment_like()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    update public.comments set like_count = like_count + 1 where id = new.comment_id;
    return new;
  elsif TG_OP = 'DELETE' then
    update public.comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
    return old;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_comment_like_ins on public.comment_likes;
create trigger trg_comment_like_ins after insert on public.comment_likes
  for each row execute function public.handle_comment_like();
drop trigger if exists trg_comment_like_del on public.comment_likes;
create trigger trg_comment_like_del after delete on public.comment_likes
  for each row execute function public.handle_comment_like();

-- Follow counters + notification (public accounts only; private handled via follow_requests)
create or replace function public.handle_new_follow()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set followers_count = followers_count + 1 where id = new.following_id;
    insert into public.notifications (recipient_id, actor_id, type)
    values (new.following_id, new.follower_id, 'follow');
    return new;
  elsif TG_OP = 'DELETE' then
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    update public.profiles set followers_count = greatest(followers_count - 1, 0) where id = old.following_id;
    return old;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_follow_ins on public.follows;
create trigger trg_follow_ins after insert on public.follows
  for each row execute function public.handle_new_follow();
drop trigger if exists trg_follow_del on public.follows;
create trigger trg_follow_del after delete on public.follows
  for each row execute function public.handle_new_follow();

-- Follow request notification
create or replace function public.handle_follow_request()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.notifications (recipient_id, actor_id, type)
    values (new.target_id, new.requester_id, 'follow_request');
  elsif TG_OP = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    insert into public.follows (follower_id, following_id) values (new.requester_id, new.target_id)
    on conflict do nothing;
    insert into public.notifications (recipient_id, actor_id, type)
    values (new.requester_id, new.target_id, 'follow_accepted');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_follow_request on public.follow_requests;
create trigger trg_follow_request after insert or update on public.follow_requests
  for each row execute function public.handle_follow_request();

-- Post count on profile
create or replace function public.handle_post_count()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' and new.is_reel = false then
    update public.profiles set posts_count = posts_count + 1 where id = new.user_id;
  elsif TG_OP = 'DELETE' and old.is_reel = false then
    update public.profiles set posts_count = greatest(posts_count - 1, 0) where id = old.user_id;
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_post_count_ins on public.posts;
create trigger trg_post_count_ins after insert on public.posts
  for each row execute function public.handle_post_count();
drop trigger if exists trg_post_count_del on public.posts;
create trigger trg_post_count_del after delete on public.posts
  for each row execute function public.handle_post_count();

-- Conversation last_message_at bump
create or replace function public.bump_conversation()
returns trigger language plpgsql security definer as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  insert into public.notifications (recipient_id, actor_id, type)
  select cm.user_id, new.sender_id, 'message'
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id;
  return new;
end;
$$;
drop trigger if exists trg_message_ins on public.messages;
create trigger trg_message_ins after insert on public.messages
  for each row execute function public.bump_conversation();

-- Mention notifications (@username in a caption or comment)
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

-- Tagged-in-photo notifications (distinct from @mentions above)
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
drop trigger if exists trg_post_tag_ins on public.post_tagged_users;
create trigger trg_post_tag_ins after insert on public.post_tagged_users
  for each row execute function public.handle_post_tag();

-- Story cleanup helper (call periodically, e.g. via pg_cron or edge function)
create or replace function public.delete_expired_stories()
returns void language sql security definer as $$
  delete from public.stories where expires_at < now();
$$;

create or replace function public.delete_expired_notes()
returns void language sql security definer as $$
  delete from public.notes where expires_at < now();
$$;

-- Story likes: counter + notification (distinct from post likes, so it
-- carries story_id rather than post_id).
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

-- =============================================================================
-- HELPER: is user A allowed to view user B's content (public OR approved follower OR self)
-- =============================================================================
create or replace function public.can_view_profile(viewer uuid, target uuid)
returns boolean language sql stable security definer as $$
  select
    viewer = target
    or not (select is_private from public.profiles where id = target)
    or exists (
      select 1 from public.follows
      where follower_id = viewer and following_id = target
    );
$$;

-- Used by the conversations/messages RLS policies below. Runs as the
-- function owner (SECURITY DEFINER), which avoids the "infinite recursion
-- detected in policy" error you get from a policy on conversation_members
-- that queries conversation_members directly.
create or replace function public.is_conversation_member(conv_id uuid, uid uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv_id and user_id = uid
  );
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_tagged_users enable row level security;
alter table public.hashtags enable row level security;
alter table public.post_hashtags enable row level security;
alter table public.post_likes enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.mentions enable row level security;
alter table public.follows enable row level security;
alter table public.follow_requests enable row level security;
alter table public.saved_posts enable row level security;
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.story_likes enable row level security;
alter table public.notes enable row level security;
alter table public.blocked_users enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.typing_status enable row level security;
alter table public.presence enable row level security;

-- PROFILES: readable by anyone (usernames/handles are public directory); only owner can update
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles for select using (true);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- POSTS: select if public account, self, or approved follower; insert/update/delete own only
drop policy if exists "posts_select_visible" on public.posts;
create policy "posts_select_visible" on public.posts for select
  using (public.can_view_profile(auth.uid(), user_id));
drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own" on public.posts for insert with check (auth.uid() = user_id);
drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own" on public.posts for update using (auth.uid() = user_id);
drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own" on public.posts for delete using (auth.uid() = user_id);

-- POST MEDIA: follows post visibility; write only via own post
drop policy if exists "post_media_select" on public.post_media;
create policy "post_media_select" on public.post_media for select
  using (exists (select 1 from public.posts p where p.id = post_id and public.can_view_profile(auth.uid(), p.user_id)));
drop policy if exists "post_media_write" on public.post_media;
create policy "post_media_write" on public.post_media for all
  using (exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));

drop policy if exists "post_tagged_select" on public.post_tagged_users;
create policy "post_tagged_select" on public.post_tagged_users for select using (true);
drop policy if exists "post_tagged_write" on public.post_tagged_users;
create policy "post_tagged_write" on public.post_tagged_users for all
  using (exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));

-- HASHTAGS: public read, any authed user can create (upsert)
drop policy if exists "hashtags_select" on public.hashtags;
create policy "hashtags_select" on public.hashtags for select using (true);
drop policy if exists "hashtags_insert" on public.hashtags;
create policy "hashtags_insert" on public.hashtags for insert with check (auth.uid() is not null);

drop policy if exists "post_hashtags_select" on public.post_hashtags;
create policy "post_hashtags_select" on public.post_hashtags for select using (true);
drop policy if exists "post_hashtags_write" on public.post_hashtags;
create policy "post_hashtags_write" on public.post_hashtags for all
  using (exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));

-- LIKES: select if post visible; insert/delete own only
drop policy if exists "post_likes_select" on public.post_likes;
create policy "post_likes_select" on public.post_likes for select
  using (exists (select 1 from public.posts p where p.id = post_id and public.can_view_profile(auth.uid(), p.user_id)));
drop policy if exists "post_likes_write" on public.post_likes;
create policy "post_likes_write" on public.post_likes for insert with check (auth.uid() = user_id);
drop policy if exists "post_likes_delete" on public.post_likes;
create policy "post_likes_delete" on public.post_likes for delete using (auth.uid() = user_id);

-- COMMENTS: select if post visible; insert as self; delete own
drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments for select
  using (exists (select 1 from public.posts p where p.id = post_id and public.can_view_profile(auth.uid(), p.user_id)));
drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments for insert with check (auth.uid() = user_id);
drop policy if exists "comments_delete_own" on public.comments;
create policy "comments_delete_own" on public.comments for delete using (auth.uid() = user_id);

drop policy if exists "comment_likes_select" on public.comment_likes;
create policy "comment_likes_select" on public.comment_likes for select using (true);
drop policy if exists "comment_likes_write" on public.comment_likes;
create policy "comment_likes_write" on public.comment_likes for insert with check (auth.uid() = user_id);
drop policy if exists "comment_likes_delete" on public.comment_likes;
create policy "comment_likes_delete" on public.comment_likes for delete using (auth.uid() = user_id);

drop policy if exists "mentions_select" on public.mentions;
create policy "mentions_select" on public.mentions for select
  using (auth.uid() = mentioned_user or auth.uid() = mentioned_by);
drop policy if exists "mentions_insert" on public.mentions;
create policy "mentions_insert" on public.mentions for insert with check (auth.uid() = mentioned_by);

-- FOLLOWS: readable by anyone (follower/following lists are public-ish); write own only
drop policy if exists "follows_select" on public.follows;
create policy "follows_select" on public.follows for select using (true);
drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own" on public.follows for insert with check (auth.uid() = follower_id);
drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own" on public.follows for delete
  using (auth.uid() = follower_id or auth.uid() = following_id);

-- FOLLOW REQUESTS: visible to requester + target; requester creates, target updates status
drop policy if exists "follow_requests_select" on public.follow_requests;
create policy "follow_requests_select" on public.follow_requests for select
  using (auth.uid() = requester_id or auth.uid() = target_id);
drop policy if exists "follow_requests_insert" on public.follow_requests;
create policy "follow_requests_insert" on public.follow_requests for insert with check (auth.uid() = requester_id);
drop policy if exists "follow_requests_update" on public.follow_requests;
create policy "follow_requests_update" on public.follow_requests for update using (auth.uid() = target_id);
drop policy if exists "follow_requests_delete" on public.follow_requests;
create policy "follow_requests_delete" on public.follow_requests for delete
  using (auth.uid() = requester_id or auth.uid() = target_id);

-- SAVED POSTS: private to owner
drop policy if exists "saved_posts_all" on public.saved_posts;
create policy "saved_posts_all" on public.saved_posts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- STORIES: select if not expired and owner is visible to viewer
drop policy if exists "stories_select" on public.stories;
create policy "stories_select" on public.stories for select
  using (expires_at > now() and public.can_view_profile(auth.uid(), user_id));
drop policy if exists "stories_insert_own" on public.stories;
create policy "stories_insert_own" on public.stories for insert with check (auth.uid() = user_id);
drop policy if exists "stories_delete_own" on public.stories;
create policy "stories_delete_own" on public.stories for delete using (auth.uid() = user_id);

drop policy if exists "story_views_select" on public.story_views;
create policy "story_views_select" on public.story_views for select
  using (auth.uid() = user_id or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid()));
drop policy if exists "story_views_insert" on public.story_views;
create policy "story_views_insert" on public.story_views for insert with check (auth.uid() = user_id);

drop policy if exists "story_likes_select" on public.story_likes;
create policy "story_likes_select" on public.story_likes for select
  using (exists (select 1 from public.stories s where s.id = story_id and public.can_view_profile(auth.uid(), s.user_id)));
drop policy if exists "story_likes_insert" on public.story_likes;
create policy "story_likes_insert" on public.story_likes for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.stories s where s.id = story_id and public.can_view_profile(auth.uid(), s.user_id))
  );
drop policy if exists "story_likes_delete" on public.story_likes;
create policy "story_likes_delete" on public.story_likes for delete using (auth.uid() = user_id);

-- NOTES: same visibility rule as stories (self, public, or approved follower)
drop policy if exists "notes_select" on public.notes;
create policy "notes_select" on public.notes for select
  using (expires_at > now() and public.can_view_profile(auth.uid(), user_id));
drop policy if exists "notes_upsert_own" on public.notes;
create policy "notes_upsert_own" on public.notes for insert with check (auth.uid() = user_id);
drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own" on public.notes for update using (auth.uid() = user_id);
drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own" on public.notes for delete using (auth.uid() = user_id);

-- BLOCKED USERS: private to blocker
drop policy if exists "blocked_users_all" on public.blocked_users;
create policy "blocked_users_all" on public.blocked_users for all
  using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- REPORTS: reporter can insert/select own; no update/delete from client
drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own" on public.reports for select using (auth.uid() = reporter_id);
drop policy if exists "reports_insert" on public.reports;
create policy "reports_insert" on public.reports for insert with check (auth.uid() = reporter_id);

-- NOTIFICATIONS: recipient only
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select using (auth.uid() = recipient_id);
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update using (auth.uid() = recipient_id);
drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications for delete using (auth.uid() = recipient_id);

-- CONVERSATIONS / MEMBERS / MESSAGES: only members can read/write.
-- NOTE: membership checks go through is_conversation_member() (a SECURITY
-- DEFINER function defined above the RLS section) rather than an inline
-- `exists (select 1 from conversation_members ...)` subquery. Referencing the
-- same table a policy protects, from inside that policy, causes Postgres to
-- report "infinite recursion detected in policy" (42P17) — the function
-- sidesteps that by running the lookup with the function owner's privileges.
drop policy if exists "conversations_select_member" on public.conversations;
create policy "conversations_select_member" on public.conversations for select
  using (public.is_conversation_member(id, auth.uid()));
drop policy if exists "conversations_insert" on public.conversations;
create policy "conversations_insert" on public.conversations for insert with check (auth.uid() is not null);
drop policy if exists "conversations_update_member" on public.conversations;
create policy "conversations_update_member" on public.conversations for update
  using (public.is_conversation_member(id, auth.uid()));

drop policy if exists "conv_members_select" on public.conversation_members;
create policy "conv_members_select" on public.conversation_members for select
  using (public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "conv_members_insert" on public.conversation_members;
create policy "conv_members_insert" on public.conversation_members for insert with check (auth.uid() is not null);
drop policy if exists "conv_members_update_own" on public.conversation_members;
create policy "conv_members_update_own" on public.conversation_members for update using (auth.uid() = user_id);
drop policy if exists "conv_members_delete_own" on public.conversation_members;
create policy "conv_members_delete_own" on public.conversation_members for delete using (auth.uid() = user_id);

drop policy if exists "messages_select_member" on public.messages;
create policy "messages_select_member" on public.messages for select
  using (public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "messages_insert_member" on public.messages;
create policy "messages_insert_member" on public.messages for insert
  with check (auth.uid() = sender_id and public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages for update using (auth.uid() = sender_id);
drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages for delete using (auth.uid() = sender_id);

drop policy if exists "typing_status_select_member" on public.typing_status;
create policy "typing_status_select_member" on public.typing_status for select
  using (public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "typing_status_write_own" on public.typing_status;
create policy "typing_status_write_own" on public.typing_status for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "presence_select_all" on public.presence;
create policy "presence_select_all" on public.presence for select using (true);
drop policy if exists "presence_write_own" on public.presence;
create policy "presence_write_own" on public.presence for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================================================
-- REALTIME: add tables to the supabase_realtime publication
-- =============================================================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.typing_status;
alter publication supabase_realtime add table public.presence;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.post_likes;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.story_likes;

-- =============================================================================
-- STORAGE BUCKETS (run once; safe if buckets already exist)
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('posts', 'posts', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('stories', 'stories', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('messages', 'messages', true)
on conflict (id) do nothing;

-- Storage RLS: users may only write inside a folder named after their own uid
drop policy if exists "storage_public_read" on storage.objects;
create policy "storage_public_read" on storage.objects for select
  using (bucket_id in ('avatars','posts','stories','messages'));

drop policy if exists "storage_owner_write" on storage.objects;
create policy "storage_owner_write" on storage.objects for insert
  with check (
    bucket_id in ('avatars','posts','stories','messages')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "storage_owner_update" on storage.objects;
create policy "storage_owner_update" on storage.objects for update
  using (
    bucket_id in ('avatars','posts','stories','messages')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "storage_owner_delete" on storage.objects;
create policy "storage_owner_delete" on storage.objects for delete
  using (
    bucket_id in ('avatars','posts','stories','messages')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
