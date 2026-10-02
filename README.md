# SMG

A full-stack, Instagram-style social media platform — original **SMG** branding, built with React, Vite, TypeScript, Tailwind CSS and Supabase (Postgres, Auth, Storage, Realtime).

Not affiliated with or endorsed by Instagram/Meta. No Instagram source code, trademarks, or copyrighted assets are used anywhere in this project.

## What's included

- **Auth**: email/password sign up & login (Supabase Auth), session persistence, protected routes
- **Feed**: stories bar, followed-users feed, multi-image carousels, video posts, optimistic like/save, infinite scroll
- **Stories**: full-screen viewer with progress bars, auto-advance, pause-on-hold, upload, 24h expiry, view tracking
- **Posts**: multi-step create flow (select media → caption/hashtags/mentions/location/tag people → publish), image + video upload to Supabase Storage
- **Interactions**: like/unlike, nested comments with replies and comment likes, save/unsave, share (copy link), report, delete own post
- **Profile**: header with stats, edit profile, Posts/Reels/Saved/Tagged tabs, followers/following lists
- **Follow system**: follow/unfollow, private-account follow requests (accept/reject), remove follower
- **Explore**: varied-size responsive grid ranked by engagement
- **Reels**: vertical swipeable full-screen video feed with autoplay
- **Search**: users + hashtags, recent searches (stored locally)
- **Notifications**: likes, comments, replies, follows, follow requests/accepts, mentions, messages — realtime badge count
- **Messaging**: 1:1 conversations, text + image/video attachments, realtime delivery, typing indicator, online/offline presence, read state, delete own message
- **Settings**: edit profile, change password, privacy (public/private), notification prefs, blocked accounts, light/dark/system theme (persisted)
- **Security**: Postgres Row Level Security on every table, storage bucket policies scoped to the uploader's own folder, file-type/size validation on every upload

## Tech stack

React 18 · Vite 5 · TypeScript · Tailwind CSS · React Router 6 · Supabase (Postgres, Auth, Storage, Realtime) · lucide-react

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In the SQL editor, paste and run the entire contents of **`supabase/schema.sql`** from this repo. It creates every table, function, trigger, RLS policy, and storage bucket in one pass. It's safe to re-run.
3. In **Project Settings → API**, copy your **Project URL** and **anon public key**.

## 2. Configure the app

```bash
cp .env.example .env
```

Fill in `.env`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Never commit `.env` or expose your **service role** key in frontend code — only the anon key belongs in `VITE_*` variables.

## 3. Install & run

```bash
npm install
npm run dev
```

Open the printed local URL, click **Sign up**, and create your first account. A profile row is created automatically by a database trigger the moment you sign up.

## 4. (Optional) Seed realistic demo data

The seed script uses your **service role** key (server-side only — never expose this in the app) to create 8 demo accounts with posts, stories, reels, comments, likes, follows and a sample conversation.

```bash
SUPABASE_URL=https://your-project-ref.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
npm run seed
```

All demo accounts share the password `SmgDemo!2026` (emails printed at the end of the script, e.g. `aria_codes@smg-demo.app`). Demo media comes from stable public placeholder services (picsum.photos, ui-avatars.com) — no copyrighted or Instagram assets are referenced.

## 5. Build for production

```bash
npm run build
npm run preview
```

## Project structure

```
src/
  components/   Reusable UI: PostCard, StoryViewer, ChatWindow, CreatePostModal, etc.
  pages/        Routed pages: Home, Explore, Reels, Profile, Messages, Settings, etc.
  layouts/      MainLayout (sidebar + mobile nav), AuthLayout
  contexts/     AuthContext, ThemeContext, ToastContext
  services/     All Supabase queries, grouped by domain (posts, follows, stories, messages, …)
  hooks/        useDebounce, useInfiniteScroll, useOnClickOutside
  types/        App types + hand-authored Database schema reference
  lib/          Supabase client
supabase/
  schema.sql    Full Postgres schema, triggers, and RLS policies
scripts/
  seed.ts       Demo data generator (service-role, run once)
```

## Notes & production considerations

- **Realtime**: messages, typing status, presence, and notifications are wired through Supabase Realtime (`postgres_changes`). The migration enables these on the relevant tables via `supabase_realtime` publication.
- **Storage**: four public buckets (`avatars`, `posts`, `stories`, `messages`) with RLS so a user can only write inside a folder named after their own `auth.uid()`; reads are public so media renders in `<img>`/`<video>` tags.
- **Private accounts**: enforced at the database level — `posts`, `post_media`, `comments`, `post_likes` and `stories` all check `can_view_profile()`, so private content is inaccessible via the API even if someone bypasses the UI.
- **Typed client**: `src/lib/supabase.ts` currently uses the untyped `createClient(...)` for simplicity. Once your schema is live, run `supabase gen types typescript --project-id <ref> > src/types/database.ts` and switch to `createClient<Database>(...)` for full autocomplete and compile-time safety on every query.
- **Story/notification cleanup**: `delete_expired_stories()` is defined in the schema but not scheduled — wire it to a Supabase Edge Function + cron (or `pg_cron`) if you want expired stories physically removed rather than just filtered out by the `expires_at` check.
