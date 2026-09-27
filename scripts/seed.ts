/**
 * SMG demo data seeder.
 *
 * Populates a fresh Supabase project with realistic demo users, posts,
 * stories, reels, comments, likes, follows, a conversation and
 * notifications, so the app has something to look at immediately.
 *
 * This script uses the SERVICE ROLE key (bypasses RLS) and must never run
 * in the browser. Run it locally with:
 *
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx \
 *   npm run seed
 *
 * Demo media comes from stable public placeholder services (picsum.photos
 * for photos/video posters, ui-avatars.com for avatars) — no Instagram or
 * other copyrighted assets are used or referenced.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.')
  console.error('Example: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DEMO_PASSWORD = 'SmgDemo!2026'

const DEMO_USERS = [
  { username: 'aria.codes', full_name: 'Aria Nakamura', bio: 'Frontend engineer 🌸 building for the web', seedColor: '4F5EF0' },
  { username: 'leo.explores', full_name: 'Leo Marchetti', bio: 'Travel photographer ✈️ 40 countries and counting', seedColor: 'FB4B4B' },
  { username: 'mina.makes', full_name: 'Mina Osei', bio: 'Ceramicist & coffee enthusiast ☕', seedColor: '6E7BFB' },
  { username: 'jt.runs', full_name: 'Jordan Tanaka', bio: 'Marathoner. Coach. Plant dad 🌱', seedColor: '34363F' },
  { username: 'sofia.eats', full_name: 'Sofia Reyes', bio: 'Home cook sharing weeknight recipes 🍝', seedColor: '9AA6FF' },
  { username: 'devon.builds', full_name: 'Devon Clarke', bio: 'Woodworker turning scraps into furniture 🪵', seedColor: '3F4AD1' },
  { username: 'priya.paints', full_name: 'Priya Anand', bio: 'Watercolor artist 🎨 prints in bio', seedColor: 'FF6B6B' },
  { username: 'noah.surfs', full_name: 'Noah Bennett', bio: 'Chasing swell on the west coast 🏄', seedColor: '121317' },
]

function avatarFor(name: string, hex: string) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${hex}&color=fff&size=256&bold=true`
}

function photoFor(seed: string, w = 900, h = 900) {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`
}

const CAPTIONS = [
  'Golden hour hits different 🌅 #sunset #goldenhour',
  'New project, who dis 👀 #wip #makers',
  'Sunday reset. Slow mornings only ☕ #sundayvibes',
  'Finally finished this one. Feels good to ship 🚀 #buildinpublic',
  'Found this spot on a whim and now it is my favorite #explore',
  'Small batch, big flavor 🍝 #homecooking #recipe',
  'Studio day. Hands covered in clay again 🧱 #ceramics',
  'PR day! New distance unlocked 🏃 #running #pr',
  'Some days the light just does all the work for you #photography',
  'Working on something new, more soon 👀 #comingsoon',
]

async function main() {
  console.log('Seeding SMG demo data…')

  const userIds: Record<string, string> = {}

  for (const u of DEMO_USERS) {
    const email = `${u.username.replace(/\./g, '_')}@smg-demo.app`
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { username: u.username, full_name: u.full_name },
    })
    if (error && !error.message.includes('already been registered')) {
      console.error(`Failed to create ${u.username}:`, error.message)
      continue
    }
    let id: string | undefined = data?.user?.id
    if (!id) {
      const { data: list } = await admin.auth.admin.listUsers()
      const existingUser: { id: string; email?: string } | undefined = list?.users.find((u2) => u2.email === email)
      id = existingUser?.id
    }
    if (!id) continue
    userIds[u.username] = id

    await admin
      .from('profiles')
      .update({ full_name: u.full_name, bio: u.bio, avatar_url: avatarFor(u.full_name, u.seedColor) })
      .eq('id', id)

    console.log(`  ✓ user ${u.username}`)
  }

  const usernames = Object.keys(userIds)

  // Follows: everyone follows the next 3 people (wraps around) for a connected graph.
  for (let i = 0; i < usernames.length; i++) {
    for (let offset = 1; offset <= 3; offset++) {
      const followerId = userIds[usernames[i]]
      const followingId = userIds[usernames[(i + offset) % usernames.length]]
      await admin.from('follows').upsert({ follower_id: followerId, following_id: followingId }, { onConflict: 'follower_id,following_id' })
    }
  }
  console.log('  ✓ follow graph')

  // Posts: 2-3 image posts + 1 reel per user.
  const postIds: string[] = []
  for (const username of usernames) {
    const userId = userIds[username]
    const postCount = 2 + Math.floor(Math.random() * 2)

    for (let p = 0; p < postCount; p++) {
      const caption = CAPTIONS[Math.floor(Math.random() * CAPTIONS.length)]
      const { data: post, error } = await admin
        .from('posts')
        .insert({ user_id: userId, caption, location: '', is_reel: false })
        .select('id')
        .single()
      if (error || !post) continue
      postIds.push(post.id)

      const imageCount = Math.random() > 0.7 ? 2 : 1
      const media = Array.from({ length: imageCount }).map((_, idx) => ({
        post_id: post.id,
        media_url: photoFor(`${username}-${p}-${idx}`),
        media_type: 'image' as const,
        position: idx,
        width: 900,
        height: 900,
      }))
      await admin.from('post_media').insert(media)
    }

    // one reel each
    const { data: reel } = await admin
      .from('posts')
      .insert({ user_id: userId, caption: CAPTIONS[Math.floor(Math.random() * CAPTIONS.length)], is_reel: true, audio_title: 'Original audio' })
      .select('id')
      .single()
    if (reel) {
      await admin.from('post_media').insert({
        post_id: reel.id,
        media_url: photoFor(`${username}-reel-cover`, 720, 1280),
        media_type: 'image',
        position: 0,
        width: 720,
        height: 1280,
      })
    }
  }
  console.log(`  ✓ ${postIds.length} posts + ${usernames.length} reels`)

  // Stories: one or two per user.
  for (const username of usernames) {
    const userId = userIds[username]
    const storyCount = 1 + Math.floor(Math.random() * 2)
    for (let s = 0; s < storyCount; s++) {
      await admin.from('stories').insert({
        user_id: userId,
        media_url: photoFor(`${username}-story-${s}`, 720, 1280),
        media_type: 'image',
        caption: '',
      })
    }
  }
  console.log('  ✓ stories')

  // Likes + comments on a random subset of posts.
  const commentTexts = ['Love this! 🔥', 'This is amazing', 'So good 😍', 'Need this in my life', 'Incredible work', 'Wow, gorgeous']
  for (const postId of postIds) {
    const likers = usernames.filter(() => Math.random() > 0.4)
    for (const liker of likers) {
      await admin.from('post_likes').upsert({ post_id: postId, user_id: userIds[liker] }, { onConflict: 'post_id,user_id' })
    }
    const commenters = usernames.filter(() => Math.random() > 0.7)
    for (const commenter of commenters) {
      await admin.from('comments').insert({
        post_id: postId,
        user_id: userIds[commenter],
        content: commentTexts[Math.floor(Math.random() * commentTexts.length)],
      })
    }
  }
  console.log('  ✓ likes + comments')

  // One direct conversation with a couple of messages between the first two users.
  if (usernames.length >= 2) {
    const [a, b] = usernames
    const { data: conv } = await admin.from('conversations').insert({ is_group: false }).select('id').single()
    if (conv) {
      await admin.from('conversation_members').insert([
        { conversation_id: conv.id, user_id: userIds[a] },
        { conversation_id: conv.id, user_id: userIds[b] },
      ])
      await admin.from('messages').insert([
        { conversation_id: conv.id, sender_id: userIds[a], content: `Hey ${b.split('.')[0]}! Loved your latest post 👀` },
        { conversation_id: conv.id, sender_id: userIds[b], content: 'Thank you so much! 🙏' },
        { conversation_id: conv.id, sender_id: userIds[a], content: "Let's collab soon" },
      ])
      console.log('  ✓ sample conversation')
    }
  }

  console.log('\nDone! Demo accounts (all share one password):')
  console.log(`  password: ${DEMO_PASSWORD}`)
  DEMO_USERS.forEach((u) => console.log(`  ${u.username.replace(/\./g, '_')}@smg-demo.app`))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
