export type MediaType = 'image' | 'video'

export interface Profile {
  id: string
  username: string
  full_name: string
  bio: string
  website: string
  avatar_url: string
  is_private: boolean
  followers_count: number
  following_count: number
  posts_count: number
  created_at: string
}

export interface PostMedia {
  id: string
  post_id: string
  media_url: string
  media_type: MediaType
  position: number
  width?: number | null
  height?: number | null
}

export interface Post {
  id: string
  user_id: string
  caption: string
  location: string
  is_reel: boolean
  audio_title: string
  cover_url: string | null
  like_count: number
  comment_count: number
  created_at: string
  updated_at?: string
  author: Profile
  media: PostMedia[]
  tagged_users?: Profile[]
  liked_by_me?: boolean
  saved_by_me?: boolean
}

export interface Comment {
  id: string
  post_id: string
  user_id: string
  parent_comment_id: string | null
  content: string
  like_count: number
  created_at: string
  author: Profile
  liked_by_me?: boolean
  replies?: Comment[]
}

export interface StoryItem {
  id: string
  user_id: string
  media_url: string
  media_type: MediaType
  caption: string
  created_at: string
  expires_at: string
}

export interface StoryGroup {
  author: Profile
  stories: StoryItem[]
  hasUnseen: boolean
}

export type NotificationType =
  | 'like'
  | 'comment'
  | 'comment_reply'
  | 'follow'
  | 'follow_request'
  | 'follow_accepted'
  | 'mention'
  | 'message'

export interface AppNotification {
  id: string
  recipient_id: string
  actor_id: string | null
  type: NotificationType
  post_id: string | null
  comment_id: string | null
  is_read: boolean
  created_at: string
  actor?: Profile
  post?: (Pick<Post, 'id' | 'media' | 'cover_url'> & { is_reel: boolean }) | null
}

export interface Conversation {
  id: string
  is_group: boolean
  title: string | null
  last_message_at: string
  members: Profile[]
  last_message?: Message | null
  unread_count?: number
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  media_url: string | null
  media_type: MediaType | null
  created_at: string
  deleted_at: string | null
  sender?: Profile
}

export interface FollowRequest {
  id: string
  requester_id: string
  target_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  requester?: Profile
}

export type ThemePreference = 'light' | 'dark' | 'system'

export interface Toast {
  id: string
  message: string
  variant?: 'default' | 'success' | 'error'
}
