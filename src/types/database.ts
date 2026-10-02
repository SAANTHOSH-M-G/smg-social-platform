// Hand-authored equivalent of `supabase gen types typescript`.
// Regenerate with the Supabase CLI once your project is live:
//   supabase gen types typescript --project-id <ref> > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
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
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string; username: string }
        Update: Partial<Database['public']['Tables']['profiles']['Row']>
      }
      posts: {
        Row: {
          id: string
          user_id: string
          caption: string
          location: string
          is_reel: boolean
          audio_title: string
          like_count: number
          comment_count: number
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['posts']['Row']> & { user_id: string }
        Update: Partial<Database['public']['Tables']['posts']['Row']>
      }
      post_media: {
        Row: {
          id: string
          post_id: string
          media_url: string
          media_type: 'image' | 'video'
          position: number
          width: number | null
          height: number | null
        }
        Insert: Partial<Database['public']['Tables']['post_media']['Row']> & { post_id: string; media_url: string }
        Update: Partial<Database['public']['Tables']['post_media']['Row']>
      }
      post_tagged_users: {
        Row: { post_id: string; user_id: string }
        Insert: { post_id: string; user_id: string }
        Update: Partial<{ post_id: string; user_id: string }>
      }
      hashtags: {
        Row: { id: string; tag: string }
        Insert: { id?: string; tag: string }
        Update: Partial<{ id: string; tag: string }>
      }
      post_hashtags: {
        Row: { post_id: string; hashtag_id: string }
        Insert: { post_id: string; hashtag_id: string }
        Update: Partial<{ post_id: string; hashtag_id: string }>
      }
      post_likes: {
        Row: { post_id: string; user_id: string; created_at: string }
        Insert: { post_id: string; user_id: string }
        Update: Partial<{ post_id: string; user_id: string }>
      }
      comments: {
        Row: {
          id: string
          post_id: string
          user_id: string
          parent_comment_id: string | null
          content: string
          like_count: number
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['comments']['Row']> & {
          post_id: string
          user_id: string
          content: string
        }
        Update: Partial<Database['public']['Tables']['comments']['Row']>
      }
      comment_likes: {
        Row: { comment_id: string; user_id: string; created_at: string }
        Insert: { comment_id: string; user_id: string }
        Update: Partial<{ comment_id: string; user_id: string }>
      }
      mentions: {
        Row: {
          id: string
          post_id: string | null
          comment_id: string | null
          mentioned_by: string
          mentioned_user: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['mentions']['Row']> & {
          mentioned_by: string
          mentioned_user: string
        }
        Update: Partial<Database['public']['Tables']['mentions']['Row']>
      }
      follows: {
        Row: { follower_id: string; following_id: string; created_at: string }
        Insert: { follower_id: string; following_id: string }
        Update: Partial<{ follower_id: string; following_id: string }>
      }
      follow_requests: {
        Row: {
          id: string
          requester_id: string
          target_id: string
          status: 'pending' | 'accepted' | 'rejected'
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['follow_requests']['Row']> & {
          requester_id: string
          target_id: string
        }
        Update: Partial<Database['public']['Tables']['follow_requests']['Row']>
      }
      saved_posts: {
        Row: { post_id: string; user_id: string; created_at: string }
        Insert: { post_id: string; user_id: string }
        Update: Partial<{ post_id: string; user_id: string }>
      }
      stories: {
        Row: {
          id: string
          user_id: string
          media_url: string
          media_type: 'image' | 'video'
          caption: string
          created_at: string
          expires_at: string
        }
        Insert: Partial<Database['public']['Tables']['stories']['Row']> & { user_id: string; media_url: string }
        Update: Partial<Database['public']['Tables']['stories']['Row']>
      }
      story_views: {
        Row: { story_id: string; user_id: string; viewed_at: string }
        Insert: { story_id: string; user_id: string }
        Update: Partial<{ story_id: string; user_id: string }>
      }
      blocked_users: {
        Row: { blocker_id: string; blocked_id: string; created_at: string }
        Insert: { blocker_id: string; blocked_id: string }
        Update: Partial<{ blocker_id: string; blocked_id: string }>
      }
      reports: {
        Row: {
          id: string
          reporter_id: string
          target_type: 'post' | 'comment' | 'user' | 'story'
          target_id: string
          reason: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['reports']['Row']> & {
          reporter_id: string
          target_type: 'post' | 'comment' | 'user' | 'story'
          target_id: string
          reason: string
        }
        Update: Partial<Database['public']['Tables']['reports']['Row']>
      }
      notifications: {
        Row: {
          id: string
          recipient_id: string
          actor_id: string | null
          type:
            | 'like'
            | 'comment'
            | 'comment_reply'
            | 'follow'
            | 'follow_request'
            | 'follow_accepted'
            | 'mention'
            | 'message'
          post_id: string | null
          comment_id: string | null
          is_read: boolean
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['notifications']['Row']> & {
          recipient_id: string
          type: Database['public']['Tables']['notifications']['Row']['type']
        }
        Update: Partial<Database['public']['Tables']['notifications']['Row']>
      }
      conversations: {
        Row: {
          id: string
          is_group: boolean
          title: string | null
          created_at: string
          last_message_at: string
        }
        Insert: Partial<Database['public']['Tables']['conversations']['Row']>
        Update: Partial<Database['public']['Tables']['conversations']['Row']>
      }
      conversation_members: {
        Row: { conversation_id: string; user_id: string; joined_at: string; last_read_at: string }
        Insert: Partial<Database['public']['Tables']['conversation_members']['Row']> & {
          conversation_id: string
          user_id: string
        }
        Update: Partial<Database['public']['Tables']['conversation_members']['Row']>
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          content: string
          media_url: string | null
          media_type: 'image' | 'video' | null
          created_at: string
          deleted_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['messages']['Row']> & {
          conversation_id: string
          sender_id: string
        }
        Update: Partial<Database['public']['Tables']['messages']['Row']>
      }
      typing_status: {
        Row: { conversation_id: string; user_id: string; updated_at: string }
        Insert: { conversation_id: string; user_id: string }
        Update: Partial<{ conversation_id: string; user_id: string }>
      }
      presence: {
        Row: { user_id: string; is_online: boolean; last_seen: string }
        Insert: Partial<Database['public']['Tables']['presence']['Row']> & { user_id: string }
        Update: Partial<Database['public']['Tables']['presence']['Row']>
      }
    }
    Views: Record<string, never>
    Functions: {
      can_view_profile: {
        Args: { viewer: string; target: string }
        Returns: boolean
      }
      delete_expired_stories: {
        Args: Record<string, never>
        Returns: void
      }
    }
    Enums: Record<string, never>
  }
}
