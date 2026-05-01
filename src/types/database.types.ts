export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_images: {
        Row: {
          key: string
          label: string
          updated_at: string
          updated_by: string | null
          url: string
        }
        Insert: {
          key: string
          label?: string
          updated_at?: string
          updated_by?: string | null
          url: string
        }
        Update: {
          key?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_images_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_images_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          target_id: string | null
          target_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          clicked_at: string | null
          created_at: string
          email: string
          error_message: string | null
          id: string
          opened_at: string | null
          profile_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          clicked_at?: string | null
          created_at?: string
          email: string
          error_message?: string | null
          id?: string
          opened_at?: string | null
          profile_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          clicked_at?: string | null
          created_at?: string
          email?: string
          error_message?: string | null
          id?: string
          opened_at?: string | null
          profile_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_reservations: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          product_id: string
          quantity: number
          updated_at: string | null
          user_id: string
          variant_key: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          product_id: string
          quantity: number
          updated_at?: string | null
          user_id: string
          variant_key: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string | null
          user_id?: string
          variant_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "merch_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_participants: {
        Row: {
          challenge_id: string
          collective_id: string | null
          id: string
          joined_at: string | null
          progress: number | null
          user_id: string | null
        }
        Insert: {
          challenge_id: string
          collective_id?: string | null
          id?: string
          joined_at?: string | null
          progress?: number | null
          user_id?: string | null
        }
        Update: {
          challenge_id?: string
          collective_id?: string | null
          id?: string
          joined_at?: string | null
          progress?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "challenge_participants_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_participants_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          cover_image_url: string | null
          created_at: string | null
          description: string | null
          end_date: string
          goal_type: string
          goal_value: number
          id: string
          is_active: boolean | null
          start_date: string
          status: string | null
          title: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          end_date: string
          goal_type: string
          goal_value: number
          id?: string
          is_active?: boolean | null
          start_date: string
          status?: string | null
          title: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string
          goal_type?: string
          goal_value?: number
          id?: string
          is_active?: boolean | null
          start_date?: string
          status?: string | null
          title?: string
        }
        Relationships: []
      }
      charity_settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value?: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      chat_announcement_responses: {
        Row: {
          announcement_id: string
          created_at: string | null
          id: string
          response: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          created_at?: string | null
          id?: string
          response: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          created_at?: string | null
          id?: string
          response?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_announcement_responses_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "chat_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_announcement_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_announcement_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_announcements: {
        Row: {
          body: string | null
          collective_id: string | null
          created_at: string | null
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          collective_id?: string | null
          created_at?: string | null
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          collective_id?: string | null
          created_at?: string | null
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_announcements_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_broadcast_log: {
        Row: {
          body: string | null
          collective_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          recipient_count: number | null
          sent_by: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          collective_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          recipient_count?: number | null
          sent_by: string
          title: string
          type: string
        }
        Update: {
          body?: string | null
          collective_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          recipient_count?: number | null
          sent_by?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_broadcast_log_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_broadcast_log_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_broadcast_log_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channel_members: {
        Row: {
          channel_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          collective_id: string | null
          created_at: string
          id: string
          name: string
          state: string | null
          type: string
        }
        Insert: {
          collective_id?: string | null
          created_at?: string
          id?: string
          name: string
          state?: string | null
          type: string
        }
        Update: {
          collective_id?: string | null
          created_at?: string
          id?: string
          name?: string
          state?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channels_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          announcement_id: string | null
          channel_id: string | null
          collective_id: string | null
          content: string | null
          created_at: string | null
          id: string
          image_url: string | null
          is_deleted: boolean | null
          is_pinned: boolean | null
          message_type: string | null
          poll_id: string | null
          reply_to_id: string | null
          updated_at: string | null
          user_id: string
          video_url: string | null
          voice_url: string | null
        }
        Insert: {
          announcement_id?: string | null
          channel_id?: string | null
          collective_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_deleted?: boolean | null
          is_pinned?: boolean | null
          message_type?: string | null
          poll_id?: string | null
          reply_to_id?: string | null
          updated_at?: string | null
          user_id: string
          video_url?: string | null
          voice_url?: string | null
        }
        Update: {
          announcement_id?: string | null
          channel_id?: string | null
          collective_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_deleted?: boolean | null
          is_pinned?: boolean | null
          message_type?: string | null
          poll_id?: string | null
          reply_to_id?: string | null
          updated_at?: string | null
          user_id?: string
          video_url?: string | null
          voice_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "chat_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "chat_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_poll_votes: {
        Row: {
          created_at: string | null
          id: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          option_id?: string
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "chat_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_polls: {
        Row: {
          allow_multiple: boolean | null
          anonymous: boolean | null
          closes_at: string | null
          collective_id: string | null
          created_at: string | null
          created_by: string
          id: string
          is_closed: boolean | null
          options: Json
          question: string
        }
        Insert: {
          allow_multiple?: boolean | null
          anonymous?: boolean | null
          closes_at?: string | null
          collective_id?: string | null
          created_at?: string | null
          created_by: string
          id?: string
          is_closed?: boolean | null
          options?: Json
          question: string
        }
        Update: {
          allow_multiple?: boolean | null
          anonymous?: boolean | null
          closes_at?: string | null
          collective_id?: string | null
          created_at?: string | null
          created_by?: string
          id?: string
          is_closed?: boolean | null
          options?: Json
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_polls_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_read_receipts: {
        Row: {
          channel_id: string | null
          collective_id: string
          id: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          channel_id?: string | null
          collective_id: string
          id?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          channel_id?: string | null
          collective_id?: string
          id?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_read_receipts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_read_receipts_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_read_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_read_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collective_applications: {
        Row: {
          additional_info: string | null
          address_line1: string
          address_line2: string | null
          attended_events: string | null
          country: string
          created_at: string
          date_of_birth: string | null
          email: string
          first_name: string
          how_heard: string
          id: string
          last_name: string
          news_opt_in: boolean
          notes: string | null
          phone: string | null
          postcode: string
          resume_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          roles: string[]
          skills: string[] | null
          state: string
          status: string
          suburb: string
          time_commitment: string
          user_id: string | null
          why_volunteer: string
        }
        Insert: {
          additional_info?: string | null
          address_line1: string
          address_line2?: string | null
          attended_events?: string | null
          country?: string
          created_at?: string
          date_of_birth?: string | null
          email: string
          first_name: string
          how_heard: string
          id?: string
          last_name: string
          news_opt_in?: boolean
          notes?: string | null
          phone?: string | null
          postcode: string
          resume_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          roles?: string[]
          skills?: string[] | null
          state: string
          status?: string
          suburb: string
          time_commitment: string
          user_id?: string | null
          why_volunteer: string
        }
        Update: {
          additional_info?: string | null
          address_line1?: string
          address_line2?: string | null
          attended_events?: string | null
          country?: string
          created_at?: string
          date_of_birth?: string | null
          email?: string
          first_name?: string
          how_heard?: string
          id?: string
          last_name?: string
          news_opt_in?: boolean
          notes?: string | null
          phone?: string | null
          postcode?: string
          resume_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          roles?: string[]
          skills?: string[] | null
          state?: string
          status?: string
          suburb?: string
          time_commitment?: string
          user_id?: string | null
          why_volunteer?: string
        }
        Relationships: [
          {
            foreignKeyName: "collective_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collective_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collective_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collective_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collective_event_collaborators: {
        Row: {
          collective_id: string
          created_at: string | null
          event_id: string
          id: string
          invited_by_collective_id: string
          invited_by_user: string
          message: string | null
          responded_at: string | null
          status: string
        }
        Insert: {
          collective_id: string
          created_at?: string | null
          event_id: string
          id?: string
          invited_by_collective_id: string
          invited_by_user: string
          message?: string | null
          responded_at?: string | null
          status?: string
        }
        Update: {
          collective_id?: string
          created_at?: string | null
          event_id?: string
          id?: string
          invited_by_collective_id?: string
          invited_by_user?: string
          message?: string | null
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "collective_event_collaborators_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collective_event_collaborators_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collective_event_collaborators_invited_by_collective_id_fkey"
            columns: ["invited_by_collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collective_event_collaborators_invited_by_user_fkey"
            columns: ["invited_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collective_event_collaborators_invited_by_user_fkey"
            columns: ["invited_by_user"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collective_members: {
        Row: {
          collective_id: string
          id: string
          joined_at: string | null
          role: Database["public"]["Enums"]["collective_role"] | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          collective_id: string
          id?: string
          joined_at?: string | null
          role?: Database["public"]["Enums"]["collective_role"] | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          collective_id?: string
          id?: string
          joined_at?: string | null
          role?: Database["public"]["Enums"]["collective_role"] | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collective_members_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collective_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collective_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collectives: {
        Row: {
          cover_image_position_x: number
          cover_image_position_y: number
          cover_image_url: string | null
          created_at: string | null
          description: string | null
          forms_migrated_at: string | null
          id: string
          is_active: boolean | null
          is_national: boolean | null
          leader_id: string | null
          location_point: unknown
          member_count: number | null
          name: string
          region: string | null
          slug: string
          state: string | null
        }
        Insert: {
          cover_image_position_x?: number
          cover_image_position_y?: number
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          forms_migrated_at?: string | null
          id?: string
          is_active?: boolean | null
          is_national?: boolean | null
          leader_id?: string | null
          location_point?: unknown
          member_count?: number | null
          name: string
          region?: string | null
          slug: string
          state?: string | null
        }
        Update: {
          cover_image_position_x?: number
          cover_image_position_y?: number
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          forms_migrated_at?: string | null
          id?: string
          is_active?: boolean | null
          is_national?: boolean | null
          leader_id?: string | null
          location_point?: unknown
          member_count?: number | null
          name?: string
          region?: string | null
          slug?: string
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collectives_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collectives_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          subject: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          subject?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          subject?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reports: {
        Row: {
          content_id: string
          content_type: string
          created_at: string | null
          id: string
          reason: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["report_status"] | null
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string | null
          id?: string
          reason: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"] | null
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "content_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_export_requests: {
        Row: {
          completed_at: string | null
          expires_at: string | null
          file_url: string | null
          id: string
          requested_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          expires_at?: string | null
          file_url?: string | null
          id?: string
          requested_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          expires_at?: string | null
          file_url?: string | null
          id?: string
          requested_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_export_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_export_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_assignments: {
        Row: {
          assigned_by: string
          collective_id: string | null
          created_at: string
          due_date: string | null
          id: string
          module_id: string | null
          notes: string | null
          scope: Database["public"]["Enums"]["dev_assignment_scope"]
          section_id: string | null
          user_id: string | null
        }
        Insert: {
          assigned_by: string
          collective_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          module_id?: string | null
          notes?: string | null
          scope?: Database["public"]["Enums"]["dev_assignment_scope"]
          section_id?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_by?: string
          collective_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          module_id?: string | null
          notes?: string | null
          scope?: Database["public"]["Enums"]["dev_assignment_scope"]
          section_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_assignments_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_assignments_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "dev_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_assignments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "dev_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_module_content: {
        Row: {
          content_type: Database["public"]["Enums"]["dev_content_type"]
          created_at: string
          file_name: string | null
          file_size_bytes: number | null
          file_url: string | null
          id: string
          image_captions: string[]
          image_urls: string[]
          module_id: string
          quiz_id: string | null
          sort_order: number
          text_content: string | null
          title: string | null
          updated_at: string
          video_provider: string | null
          video_url: string | null
        }
        Insert: {
          content_type: Database["public"]["Enums"]["dev_content_type"]
          created_at?: string
          file_name?: string | null
          file_size_bytes?: number | null
          file_url?: string | null
          id?: string
          image_captions?: string[]
          image_urls?: string[]
          module_id: string
          quiz_id?: string | null
          sort_order?: number
          text_content?: string | null
          title?: string | null
          updated_at?: string
          video_provider?: string | null
          video_url?: string | null
        }
        Update: {
          content_type?: Database["public"]["Enums"]["dev_content_type"]
          created_at?: string
          file_name?: string | null
          file_size_bytes?: number | null
          file_url?: string | null
          id?: string
          image_captions?: string[]
          image_urls?: string[]
          module_id?: string
          quiz_id?: string | null
          sort_order?: number
          text_content?: string | null
          title?: string | null
          updated_at?: string
          video_provider?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_module_content_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "dev_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_module_content_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "dev_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_modules: {
        Row: {
          category: Database["public"]["Enums"]["dev_category"]
          created_at: string
          created_by: string
          description: string | null
          estimated_minutes: number
          id: string
          pass_score: number | null
          published_at: string | null
          status: Database["public"]["Enums"]["dev_module_status"]
          target_roles: string[]
          target_user_ids: string[]
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["dev_category"]
          created_at?: string
          created_by: string
          description?: string | null
          estimated_minutes?: number
          id?: string
          pass_score?: number | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["dev_module_status"]
          target_roles?: string[]
          target_user_ids?: string[]
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["dev_category"]
          created_at?: string
          created_by?: string
          description?: string | null
          estimated_minutes?: number
          id?: string
          pass_score?: number | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["dev_module_status"]
          target_roles?: string[]
          target_user_ids?: string[]
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_modules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_modules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_quiz_attempts: {
        Row: {
          completed_at: string | null
          id: string
          module_id: string | null
          passed: boolean
          points_earned: number
          points_total: number
          quiz_id: string
          score_pct: number
          started_at: string
          time_spent_sec: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          module_id?: string | null
          passed?: boolean
          points_earned?: number
          points_total?: number
          quiz_id: string
          score_pct: number
          started_at?: string
          time_spent_sec?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          module_id?: string | null
          passed?: boolean
          points_earned?: number
          points_total?: number
          quiz_id?: string
          score_pct?: number
          started_at?: string
          time_spent_sec?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_quiz_attempts_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "dev_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "dev_quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_quiz_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_quiz_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_quiz_options: {
        Row: {
          created_at: string
          id: string
          is_correct: boolean
          option_text: string
          question_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_correct?: boolean
          option_text: string
          question_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_correct?: boolean
          option_text?: string
          question_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "dev_quiz_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "dev_quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_quiz_questions: {
        Row: {
          created_at: string
          explanation: string | null
          id: string
          image_url: string | null
          points: number
          question_text: string
          question_type: Database["public"]["Enums"]["dev_question_type"]
          quiz_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          explanation?: string | null
          id?: string
          image_url?: string | null
          points?: number
          question_text: string
          question_type: Database["public"]["Enums"]["dev_question_type"]
          quiz_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          explanation?: string | null
          id?: string
          image_url?: string | null
          points?: number
          question_text?: string
          question_type?: Database["public"]["Enums"]["dev_question_type"]
          quiz_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "dev_quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "dev_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_quiz_responses: {
        Row: {
          attempt_id: string
          created_at: string
          id: string
          is_correct: boolean
          points_earned: number
          question_id: string
          selected_option_ids: string[]
          text_response: string | null
        }
        Insert: {
          attempt_id: string
          created_at?: string
          id?: string
          is_correct?: boolean
          points_earned?: number
          question_id: string
          selected_option_ids?: string[]
          text_response?: string | null
        }
        Update: {
          attempt_id?: string
          created_at?: string
          id?: string
          is_correct?: boolean
          points_earned?: number
          question_id?: string
          selected_option_ids?: string[]
          text_response?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_quiz_responses_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "dev_quiz_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_quiz_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "dev_quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_quizzes: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          max_attempts: number
          pass_score: number
          randomize_questions: boolean
          time_limit_minutes: number | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          max_attempts?: number
          pass_score?: number
          randomize_questions?: boolean
          time_limit_minutes?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          max_attempts?: number
          pass_score?: number
          randomize_questions?: boolean
          time_limit_minutes?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_quizzes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_quizzes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_section_modules: {
        Row: {
          id: string
          is_required: boolean
          module_id: string
          section_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          is_required?: boolean
          module_id: string
          section_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          is_required?: boolean
          module_id?: string
          section_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "dev_section_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "dev_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_section_modules_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "dev_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_sections: {
        Row: {
          category: Database["public"]["Enums"]["dev_category"]
          created_at: string
          created_by: string
          description: string | null
          id: string
          prerequisite_section_id: string | null
          published_at: string | null
          status: Database["public"]["Enums"]["dev_module_status"]
          target_roles: string[]
          target_user_ids: string[]
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["dev_category"]
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          prerequisite_section_id?: string | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["dev_module_status"]
          target_roles?: string[]
          target_user_ids?: string[]
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["dev_category"]
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          prerequisite_section_id?: string | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["dev_module_status"]
          target_roles?: string[]
          target_user_ids?: string[]
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_sections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_sections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_sections_prerequisite_section_id_fkey"
            columns: ["prerequisite_section_id"]
            isOneToOne: false
            referencedRelation: "dev_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_user_module_progress: {
        Row: {
          completed_at: string | null
          id: string
          last_content_id: string | null
          last_sort_order: number | null
          module_id: string
          progress_pct: number
          started_at: string | null
          status: Database["public"]["Enums"]["dev_progress_status"]
          time_spent_sec: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          last_content_id?: string | null
          last_sort_order?: number | null
          module_id: string
          progress_pct?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["dev_progress_status"]
          time_spent_sec?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          last_content_id?: string | null
          last_sort_order?: number | null
          module_id?: string
          progress_pct?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["dev_progress_status"]
          time_spent_sec?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_user_module_progress_last_content_id_fkey"
            columns: ["last_content_id"]
            isOneToOne: false
            referencedRelation: "dev_module_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_user_module_progress_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "dev_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_user_module_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_user_module_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_user_section_progress: {
        Row: {
          completed_at: string | null
          id: string
          modules_completed: number
          modules_total: number
          progress_pct: number
          section_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["dev_progress_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          modules_completed?: number
          modules_total?: number
          progress_pct?: number
          section_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["dev_progress_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          modules_completed?: number
          modules_total?: number
          progress_pct?: number
          section_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["dev_progress_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_user_section_progress_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "dev_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_user_section_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_user_section_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      donation_projects: {
        Row: {
          created_at: string | null
          description: string | null
          goal_amount: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          raised_amount: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          goal_amount?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          raised_amount?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          goal_amount?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          raised_amount?: number | null
        }
        Relationships: []
      }
      donations: {
        Row: {
          amount: number
          amount_cents: number | null
          created_at: string | null
          currency: string | null
          donor_email: string | null
          donor_name: string | null
          id: string
          is_public: boolean | null
          message: string | null
          on_behalf_of: string | null
          project_name: string | null
          receipt_number: string | null
          status: string | null
          stripe_payment_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          amount_cents?: number | null
          created_at?: string | null
          currency?: string | null
          donor_email?: string | null
          donor_name?: string | null
          id?: string
          is_public?: boolean | null
          message?: string | null
          on_behalf_of?: string | null
          project_name?: string | null
          receipt_number?: string | null
          status?: string | null
          stripe_payment_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          amount_cents?: number | null
          created_at?: string | null
          currency?: string | null
          donor_email?: string | null
          donor_name?: string | null
          id?: string
          is_public?: boolean | null
          message?: string | null
          on_behalf_of?: string | null
          project_name?: string | null
          receipt_number?: string | null
          status?: string | null
          stripe_payment_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          body_html: string
          body_text: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          scheduled_at: string | null
          sent_at: string | null
          status: string
          subject: string
          target_all: boolean
          target_collective_ids: string[] | null
          target_tag_ids: string[] | null
          template_id: string | null
          total_bounced: number
          total_clicked: number
          total_delivered: number
          total_opened: number
          total_recipients: number
          total_unsubscribed: number
          updated_at: string
        }
        Insert: {
          body_html?: string
          body_text?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          target_all?: boolean
          target_collective_ids?: string[] | null
          target_tag_ids?: string[] | null
          template_id?: string | null
          total_bounced?: number
          total_clicked?: number
          total_delivered?: number
          total_opened?: number
          total_recipients?: number
          total_unsubscribed?: number
          updated_at?: string
        }
        Update: {
          body_html?: string
          body_text?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          target_all?: boolean
          target_collective_ids?: string[] | null
          target_tag_ids?: string[] | null
          template_id?: string | null
          total_bounced?: number
          total_clicked?: number
          total_delivered?: number
          total_opened?: number
          total_recipients?: number
          total_unsubscribed?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          created_at: string | null
          email: string
          event_type: string
          id: string
          reason: string | null
          sg_event_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          event_type: string
          id?: string
          reason?: string | null
          sg_event_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          event_type?: string
          id?: string
          reason?: string | null
          sg_event_id?: string | null
        }
        Relationships: []
      }
      email_reminders_sent: {
        Row: {
          event_id: string
          id: string
          reminder_type: string
          sent_at: string
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          reminder_type: string
          sent_at?: string
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          reminder_type?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_reminders_sent_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppressions: {
        Row: {
          created_at: string | null
          email: string
          id: string
          reason: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          reason?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          reason?: string
        }
        Relationships: []
      }
      email_tags: {
        Row: {
          colour: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          colour?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          colour?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_html: string
          body_text: string
          category: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          subject: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          body_html?: string
          body_text?: string
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          subject: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          body_html?: string
          body_text?: string
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          subject?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          note: string | null
          phone: string
          sort_order: number
          states: string[]
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          phone: string
          sort_order?: number
          states?: string[]
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          phone?: string
          sort_order?: number
          states?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      event_day_notifications_sent: {
        Row: {
          event_id: string
          id: string
          notification_type: string
          sent_at: string | null
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          notification_type: string
          sent_at?: string | null
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          notification_type?: string
          sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_day_notifications_sent_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_day_notifications_sent_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_day_notifications_sent_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_impact: {
        Row: {
          area_restored_sqm: number | null
          attendees: number | null
          coastline_cleaned_m: number | null
          custom_metrics: Json | null
          event_id: string
          hours_total: number | null
          id: string
          invasive_weeds_pulled: number | null
          leaders_trained: number | null
          logged_at: string | null
          logged_by: string | null
          native_plants: number | null
          notes: string | null
          rubbish_kg: number | null
          trees_planted: number | null
          wildlife_sightings: number | null
        }
        Insert: {
          area_restored_sqm?: number | null
          attendees?: number | null
          coastline_cleaned_m?: number | null
          custom_metrics?: Json | null
          event_id: string
          hours_total?: number | null
          id?: string
          invasive_weeds_pulled?: number | null
          leaders_trained?: number | null
          logged_at?: string | null
          logged_by?: string | null
          native_plants?: number | null
          notes?: string | null
          rubbish_kg?: number | null
          trees_planted?: number | null
          wildlife_sightings?: number | null
        }
        Update: {
          area_restored_sqm?: number | null
          attendees?: number | null
          coastline_cleaned_m?: number | null
          custom_metrics?: Json | null
          event_id?: string
          hours_total?: number | null
          id?: string
          invasive_weeds_pulled?: number | null
          leaders_trained?: number | null
          logged_at?: string | null
          logged_by?: string | null
          native_plants?: number | null
          notes?: string | null
          rubbish_kg?: number | null
          trees_planted?: number | null
          wildlife_sightings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_impact_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_impact_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_impact_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_invites: {
        Row: {
          collective_id: string
          created_at: string | null
          event_id: string
          id: string
          invited_by: string | null
          message: string | null
        }
        Insert: {
          collective_id: string
          created_at?: string | null
          event_id: string
          id?: string
          invited_by?: string | null
          message?: string | null
        }
        Update: {
          collective_id?: string
          created_at?: string | null
          event_id?: string
          id?: string
          invited_by?: string | null
          message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_invites_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_maybe_reminders: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          remind_at: string
          sent: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          remind_at: string
          sent?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          remind_at?: string
          sent?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_maybe_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_maybe_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_maybe_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_organisations: {
        Row: {
          event_id: string
          id: string
          organisation_id: string
          role: string | null
        }
        Insert: {
          event_id: string
          id?: string
          organisation_id: string
          role?: string | null
        }
        Update: {
          event_id?: string
          id?: string
          organisation_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_organisations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_organisations_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          checked_in_at: string | null
          event_id: string
          id: string
          invited_at: string | null
          registered_at: string | null
          status: Database["public"]["Enums"]["registration_status"] | null
          user_id: string
        }
        Insert: {
          checked_in_at?: string | null
          event_id: string
          id?: string
          invited_at?: string | null
          registered_at?: string | null
          status?: Database["public"]["Enums"]["registration_status"] | null
          user_id: string
        }
        Update: {
          checked_in_at?: string | null
          event_id?: string
          id?: string
          invited_at?: string | null
          registered_at?: string | null
          status?: Database["public"]["Enums"]["registration_status"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_series: {
        Row: {
          collective_id: string
          created_at: string | null
          created_by: string | null
          id: string
          recurrence_rule: Json
          title_template: string
        }
        Insert: {
          collective_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          recurrence_rule?: Json
          title_template: string
        }
        Update: {
          collective_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          recurrence_rule?: Json
          title_template?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_series_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ticket_types: {
        Row: {
          capacity: number | null
          created_at: string | null
          description: string | null
          event_id: string
          id: string
          is_active: boolean | null
          name: string
          price_cents: number
          sale_end: string | null
          sale_start: string | null
          sort_order: number | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string | null
          description?: string | null
          event_id: string
          id?: string
          is_active?: boolean | null
          name: string
          price_cents: number
          sale_end?: string | null
          sale_start?: string | null
          sort_order?: number | null
        }
        Update: {
          capacity?: number | null
          created_at?: string | null
          description?: string | null
          event_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          price_cents?: number
          sale_end?: string | null
          sale_start?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tickets: {
        Row: {
          checked_in_at: string | null
          created_at: string | null
          event_id: string
          id: string
          price_cents: number
          quantity: number
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          ticket_code: string | null
          ticket_type_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          checked_in_at?: string | null
          created_at?: string | null
          event_id: string
          id?: string
          price_cents: number
          quantity?: number
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          ticket_code?: string | null
          ticket_type_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          checked_in_at?: string | null
          created_at?: string | null
          event_id?: string
          id?: string
          price_cents?: number
          quantity?: number
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          ticket_code?: string | null
          ticket_type_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tickets_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "event_ticket_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          address: string | null
          capacity: number | null
          check_in_code: string | null
          checkin_window_minutes: number | null
          collective_id: string
          cover_image_position_x: number
          cover_image_position_y: number
          cover_image_url: string | null
          created_at: string | null
          created_by: string | null
          date_end: string | null
          date_start: string
          description: string | null
          external_registration_url: string | null
          id: string
          is_external_collaboration: boolean | null
          is_public: boolean | null
          is_ticketed: boolean | null
          location_point: unknown
          series_id: string | null
          status: Database["public"]["Enums"]["event_status"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          address?: string | null
          capacity?: number | null
          check_in_code?: string | null
          checkin_window_minutes?: number | null
          collective_id: string
          cover_image_position_x?: number
          cover_image_position_y?: number
          cover_image_url?: string | null
          created_at?: string | null
          created_by?: string | null
          date_end?: string | null
          date_start: string
          description?: string | null
          external_registration_url?: string | null
          id?: string
          is_external_collaboration?: boolean | null
          is_public?: boolean | null
          is_ticketed?: boolean | null
          location_point?: unknown
          series_id?: string | null
          status?: Database["public"]["Enums"]["event_status"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          address?: string | null
          capacity?: number | null
          check_in_code?: string | null
          checkin_window_minutes?: number | null
          collective_id?: string
          cover_image_position_x?: number
          cover_image_position_y?: number
          cover_image_url?: string | null
          created_at?: string | null
          created_by?: string | null
          date_end?: string | null
          date_start?: string
          description?: string | null
          external_registration_url?: string | null
          id?: string
          is_external_collaboration?: boolean | null
          is_public?: boolean | null
          is_ticketed?: boolean | null
          location_point?: unknown
          series_id?: string | null
          status?: Database["public"]["Enums"]["event_status"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      excel_sync_runs: {
        Row: {
          created_at: string
          direction: string
          event_id: string | null
          from_excel_error_count: number | null
          from_excel_forms_rows_synced: number | null
          from_excel_skipped_legacy: number | null
          from_excel_skipped_no_collective: number | null
          from_excel_synced: number | null
          id: string
          run_at: string
          summary: Json | null
          to_excel_appended: number | null
          to_excel_error_count: number | null
          to_excel_skipped: number | null
          to_excel_skipped_duplicates: number | null
          to_excel_updated: number | null
          to_excel_weak_dedup_warning_count: number | null
        }
        Insert: {
          created_at?: string
          direction: string
          event_id?: string | null
          from_excel_error_count?: number | null
          from_excel_forms_rows_synced?: number | null
          from_excel_skipped_legacy?: number | null
          from_excel_skipped_no_collective?: number | null
          from_excel_synced?: number | null
          id?: string
          run_at?: string
          summary?: Json | null
          to_excel_appended?: number | null
          to_excel_error_count?: number | null
          to_excel_skipped?: number | null
          to_excel_skipped_duplicates?: number | null
          to_excel_updated?: number | null
          to_excel_weak_dedup_warning_count?: number | null
        }
        Update: {
          created_at?: string
          direction?: string
          event_id?: string | null
          from_excel_error_count?: number | null
          from_excel_forms_rows_synced?: number | null
          from_excel_skipped_legacy?: number | null
          from_excel_skipped_no_collective?: number | null
          from_excel_synced?: number | null
          id?: string
          run_at?: string
          summary?: Json | null
          to_excel_appended?: number | null
          to_excel_error_count?: number | null
          to_excel_skipped?: number | null
          to_excel_skipped_duplicates?: number | null
          to_excel_updated?: number | null
          to_excel_weak_dedup_warning_count?: number | null
        }
        Relationships: []
      }
      impact_areas: {
        Row: {
          area_sqm: number | null
          event_impact_id: string
          id: string
          polygon: unknown
        }
        Insert: {
          area_sqm?: number | null
          event_impact_id: string
          id?: string
          polygon: unknown
        }
        Update: {
          area_sqm?: number | null
          event_impact_id?: string
          id?: string
          polygon?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "impact_areas_event_impact_id_fkey"
            columns: ["event_impact_id"]
            isOneToOne: false
            referencedRelation: "event_impact"
            referencedColumns: ["id"]
          },
        ]
      }
      impact_metric_defs: {
        Row: {
          created_at: string | null
          decimal: boolean
          icon: string
          id: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
          survey_linkable: boolean
          unit: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          decimal?: boolean
          icon?: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
          survey_linkable?: boolean
          unit?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          decimal?: boolean
          icon?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          survey_linkable?: boolean
          unit?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      impact_species: {
        Row: {
          count: number | null
          event_impact_id: string
          id: string
          is_native: boolean | null
          species_name: string
        }
        Insert: {
          count?: number | null
          event_impact_id: string
          id?: string
          is_native?: boolean | null
          species_name: string
        }
        Update: {
          count?: number | null
          event_impact_id?: string
          id?: string
          is_native?: boolean | null
          species_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "impact_species_event_impact_id_fkey"
            columns: ["event_impact_id"]
            isOneToOne: false
            referencedRelation: "event_impact"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          code: string
          created_at: string | null
          id: string
          invitee_email: string
          inviter_id: string
          status: string | null
        }
        Insert: {
          code?: string
          created_at?: string | null
          id?: string
          invitee_email: string
          inviter_id: string
          status?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          invitee_email?: string
          inviter_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leader_todos: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          due_time: string | null
          id: string
          priority: string
          sort_order: number
          source_template_id: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          priority?: string
          sort_order?: number
          source_template_id?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          priority?: string
          sort_order?: number
          source_template_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leader_todos_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leader_todos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leader_todos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_pages: {
        Row: {
          content: string
          created_at: string
          is_published: boolean
          slug: string
          summary: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string
          created_at?: string
          is_published?: boolean
          slug: string
          summary?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          is_published?: boolean
          slug?: string
          summary?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_pages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_pages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plans: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          price_monthly: number
          price_yearly: number
          sort_order: number | null
          stripe_price_monthly: string | null
          stripe_price_yearly: string | null
          stripe_product_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price_monthly?: number
          price_yearly?: number
          sort_order?: number | null
          stripe_price_monthly?: string | null
          stripe_price_yearly?: string | null
          stripe_product_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price_monthly?: number
          price_yearly?: number
          sort_order?: number | null
          stripe_price_monthly?: string | null
          stripe_price_yearly?: string | null
          stripe_product_id?: string | null
        }
        Relationships: []
      }
      membership_rewards: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          discount_code: string | null
          discount_percent: number | null
          id: string
          is_active: boolean | null
          partner_logo_url: string | null
          partner_name: string | null
          plans: string[] | null
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          discount_code?: string | null
          discount_percent?: number | null
          id?: string
          is_active?: boolean | null
          partner_logo_url?: string | null
          partner_name?: string | null
          plans?: string[] | null
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          discount_code?: string | null
          discount_percent?: number | null
          id?: string
          is_active?: boolean | null
          partner_logo_url?: string | null
          partner_name?: string | null
          plans?: string[] | null
          title?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          interval: string
          plan_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          interval?: string
          plan_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          interval?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merch_inventory: {
        Row: {
          id: string
          low_stock_threshold: number | null
          product_id: string
          stock_count: number | null
          updated_at: string | null
          variant_key: string
        }
        Insert: {
          id?: string
          low_stock_threshold?: number | null
          product_id: string
          stock_count?: number | null
          updated_at?: string | null
          variant_key: string
        }
        Update: {
          id?: string
          low_stock_threshold?: number | null
          product_id?: string
          stock_count?: number | null
          updated_at?: string | null
          variant_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "merch_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "merch_products"
            referencedColumns: ["id"]
          },
        ]
      }
      merch_orders: {
        Row: {
          created_at: string | null
          gst_cents: number | null
          id: string
          items: Json
          shipping_address: Json | null
          shipping_city: string | null
          shipping_name: string | null
          shipping_postcode: string | null
          shipping_state: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          stripe_payment_id: string | null
          total: number
          total_cents: number | null
          tracking_number: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          gst_cents?: number | null
          id?: string
          items?: Json
          shipping_address?: Json | null
          shipping_city?: string | null
          shipping_name?: string | null
          shipping_postcode?: string | null
          shipping_state?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          stripe_payment_id?: string | null
          total: number
          total_cents?: number | null
          tracking_number?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          gst_cents?: number | null
          id?: string
          items?: Json
          shipping_address?: Json | null
          shipping_city?: string | null
          shipping_name?: string | null
          shipping_postcode?: string | null
          shipping_state?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          stripe_payment_id?: string | null
          total?: number
          total_cents?: number | null
          tracking_number?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merch_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merch_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merch_products: {
        Row: {
          base_price_cents: number | null
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          images: string[] | null
          is_active: boolean | null
          name: string
          price: number
          slug: string | null
          status: string | null
          stripe_price_id: string | null
          updated_at: string | null
          variants: Json | null
        }
        Insert: {
          base_price_cents?: number | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean | null
          name: string
          price: number
          slug?: string | null
          status?: string | null
          stripe_price_id?: string | null
          updated_at?: string | null
          variants?: Json | null
        }
        Update: {
          base_price_cents?: number | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean | null
          name?: string
          price?: number
          slug?: string | null
          status?: string | null
          stripe_price_id?: string | null
          updated_at?: string | null
          variants?: Json | null
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          collective_id: string
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          collective_id: string
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          collective_id?: string
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_recipients: {
        Row: {
          created_at: string
          event_type: string
          id: string
          notify_email: boolean
          notify_push: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          notify_email?: boolean
          notify_push?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          notify_email?: boolean
          notify_push?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          data: Json | null
          id: string
          read_at: string | null
          title: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_redemptions: {
        Row: {
          id: string
          offer_id: string
          redeemed_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          offer_id: string
          redeemed_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          offer_id?: string
          redeemed_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_redemptions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "partner_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          created_at: string | null
          description: string | null
          id: string
          logo_url: string | null
          name: string
          type: string | null
          website: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          type?: string | null
          website?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          type?: string | null
          website?: string | null
        }
        Relationships: []
      }
      partner_offers: {
        Row: {
          category: string | null
          code: string | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          offer_details: string | null
          organisation_id: string | null
          partner_name: string
          points_cost: number | null
          terms_and_conditions: string | null
          title: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          category?: string | null
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          offer_details?: string | null
          organisation_id?: string | null
          partner_name: string
          points_cost?: number | null
          terms_and_conditions?: string | null
          title?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          category?: string | null
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          offer_details?: string | null
          organisation_id?: string | null
          partner_name?: string
          points_cost?: number | null
          terms_and_conditions?: string | null
          title?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_offers_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string | null
          donation_id: string | null
          id: string
          order_id: string | null
          status: string
          stripe_payment_id: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          donation_id?: string | null
          id?: string
          order_id?: string | null
          status?: string
          stripe_payment_id?: string | null
          type?: string
          user_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          donation_id?: string | null
          id?: string
          order_id?: string | null
          status?: string
          stripe_payment_id?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_donation_id_fkey"
            columns: ["donation_id"]
            isOneToOne: false
            referencedRelation: "donations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "merch_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      points_ledger: {
        Row: {
          amount: number
          created_at: string | null
          event_id: string | null
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          event_id?: string | null
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          event_id?: string | null
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_ledger_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_event_survey_responses: {
        Row: {
          answers: Json
          event_id: string
          id: string
          submitted_at: string | null
          user_id: string
        }
        Insert: {
          answers?: Json
          event_id: string
          id?: string
          submitted_at?: string | null
          user_id: string
        }
        Update: {
          answers?: Json
          event_id?: string
          id?: string
          submitted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_event_survey_responses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_event_survey_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_event_survey_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_event_survey_templates: {
        Row: {
          activity_type: string
          created_at: string | null
          id: string
          impact_metric: string | null
          impact_unit: string | null
          is_required: boolean | null
          options: Json | null
          question_key: string
          question_text: string
          question_type: string
          sort_order: number
          unit: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          id?: string
          impact_metric?: string | null
          impact_unit?: string | null
          is_required?: boolean | null
          options?: Json | null
          question_key: string
          question_text: string
          question_type: string
          sort_order?: number
          unit?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          id?: string
          impact_metric?: string | null
          impact_unit?: string | null
          is_required?: boolean | null
          options?: Json | null
          question_key?: string
          question_text?: string
          question_type?: string
          sort_order?: number
          unit?: string | null
        }
        Relationships: []
      }
      profile_tags: {
        Row: {
          assigned_at: string
          profile_id: string
          tag_id: string
        }
        Insert: {
          assigned_at?: string
          profile_id: string
          tag_id: string
        }
        Update: {
          assigned_at?: string
          profile_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_tags_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_tags_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "email_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accessibility_requirements: string | null
          age: number | null
          avatar_url: string | null
          bio: string | null
          collective_discovery: string | null
          created_at: string | null
          date_of_birth: string | null
          deleted_at: string | null
          deletion_requested_at: string | null
          deletion_status: string | null
          display_name: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          first_name: string | null
          gender: string | null
          id: string
          instagram_handle: string | null
          interests: string[] | null
          is_suspended: boolean | null
          last_name: string | null
          location: string | null
          location_point: unknown
          marketing_opt_in: boolean | null
          membership_level: string | null
          notification_preferences: Json | null
          onboarding_completed: boolean | null
          phone: string | null
          points: number | null
          postcode: string | null
          primary_chat_id: string | null
          profile_details_completed: boolean | null
          pronouns: string | null
          referred_by: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          suspended_reason: string | null
          suspended_until: string | null
          tos_accepted_at: string | null
          tos_accepted_version: string | null
          updated_at: string | null
        }
        Insert: {
          accessibility_requirements?: string | null
          age?: number | null
          avatar_url?: string | null
          bio?: string | null
          collective_discovery?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          deletion_requested_at?: string | null
          deletion_status?: string | null
          display_name?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          first_name?: string | null
          gender?: string | null
          id: string
          instagram_handle?: string | null
          interests?: string[] | null
          is_suspended?: boolean | null
          last_name?: string | null
          location?: string | null
          location_point?: unknown
          marketing_opt_in?: boolean | null
          membership_level?: string | null
          notification_preferences?: Json | null
          onboarding_completed?: boolean | null
          phone?: string | null
          points?: number | null
          postcode?: string | null
          primary_chat_id?: string | null
          profile_details_completed?: boolean | null
          pronouns?: string | null
          referred_by?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          suspended_reason?: string | null
          suspended_until?: string | null
          tos_accepted_at?: string | null
          tos_accepted_version?: string | null
          updated_at?: string | null
        }
        Update: {
          accessibility_requirements?: string | null
          age?: number | null
          avatar_url?: string | null
          bio?: string | null
          collective_discovery?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          deletion_requested_at?: string | null
          deletion_status?: string | null
          display_name?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          instagram_handle?: string | null
          interests?: string[] | null
          is_suspended?: boolean | null
          last_name?: string | null
          location?: string | null
          location_point?: unknown
          marketing_opt_in?: boolean | null
          membership_level?: string | null
          notification_preferences?: Json | null
          onboarding_completed?: boolean | null
          phone?: string | null
          points?: number | null
          postcode?: string | null
          primary_chat_id?: string | null
          profile_details_completed?: boolean | null
          pronouns?: string | null
          referred_by?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          suspended_reason?: string | null
          suspended_until?: string | null
          tos_accepted_at?: string | null
          tos_accepted_version?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          min_order_amount: number | null
          type: Database["public"]["Enums"]["promo_type"]
          uses_count: number | null
          valid_from: string | null
          valid_to: string | null
          value: number
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_order_amount?: number | null
          type: Database["public"]["Enums"]["promo_type"]
          uses_count?: number | null
          valid_from?: string | null
          valid_to?: string | null
          value: number
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_order_amount?: number | null
          type?: Database["public"]["Enums"]["promo_type"]
          uses_count?: number | null
          valid_from?: string | null
          valid_to?: string | null
          value?: number
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          device_info: Json | null
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: Json | null
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: Json | null
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_donations: {
        Row: {
          amount: number
          cancelled_at: string | null
          created_at: string | null
          currency: string | null
          id: string
          status: string | null
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          cancelled_at?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          status?: string | null
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          cancelled_at?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          status?: string | null
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_donations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_donations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      return_requests: {
        Row: {
          created_at: string | null
          id: string
          order_id: string
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id: string
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "merch_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value?: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      staff_roles: {
        Row: {
          assigned_by: string | null
          created_at: string | null
          id: string
          managed_collectives: string[] | null
          permissions: Json
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          managed_collectives?: string[] | null
          permissions?: Json
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          managed_collectives?: string[] | null
          permissions?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_responses: {
        Row: {
          answers: Json
          event_id: string | null
          id: string
          submitted_at: string | null
          survey_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          answers?: Json
          event_id?: string | null
          id?: string
          submitted_at?: string | null
          survey_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          answers?: Json
          event_id?: string | null
          id?: string
          submitted_at?: string | null
          survey_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      surveys: {
        Row: {
          activity_type: string | null
          auto_send_after_event: boolean | null
          created_at: string | null
          created_by: string | null
          description: string | null
          event_id: string | null
          id: string
          is_active: boolean | null
          is_impact_form: boolean
          questions: Json
          status: string | null
          title: string
        }
        Insert: {
          activity_type?: string | null
          auto_send_after_event?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          is_active?: boolean | null
          is_impact_form?: boolean
          questions?: Json
          status?: string | null
          title: string
        }
        Update: {
          activity_type?: string | null
          auto_send_after_event?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          is_active?: boolean | null
          is_impact_form?: boolean
          questions?: Json
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "surveys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surveys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surveys_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      system_email_overrides: {
        Row: {
          body_html: string | null
          created_at: string
          cta_label: string | null
          cta_url: string | null
          enabled: boolean
          hero_emoji: string | null
          hero_subtitle: string | null
          hero_title: string | null
          subject: string | null
          template_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body_html?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          enabled?: boolean
          hero_emoji?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          subject?: string | null
          template_type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body_html?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          enabled?: boolean
          hero_emoji?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          subject?: string | null
          template_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      task_instances: {
        Row: {
          assigned_user_id: string | null
          collective_id: string
          completed_at: string | null
          completed_by: string | null
          completion_notes: string | null
          created_at: string
          due_date: string
          event_id: string | null
          id: string
          period_key: string
          status: string
          template_id: string
          updated_at: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          collective_id: string
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          created_at?: string
          due_date: string
          event_id?: string | null
          id?: string
          period_key: string
          status?: string
          template_id: string
          updated_at?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          collective_id?: string
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          created_at?: string
          due_date?: string
          event_id?: string | null
          id?: string
          period_key?: string
          status?: string
          template_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_instances_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_instances_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_instances_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_instances_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_instances_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_instances_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          assigned_to_user_id: string | null
          assignee_role: string
          assignment_mode: string
          attachment_label: string | null
          attachment_url: string | null
          category: string
          collective_id: string | null
          created_at: string
          created_by: string
          day_of_month: number | null
          day_of_week: number | null
          description: string | null
          event_offset_days: number | null
          id: string
          is_active: boolean
          schedule_type: string
          sort_order: number
          survey_id: string | null
          title: string
          updated_at: string
          use_dynamic_timeline: boolean
        }
        Insert: {
          assigned_to_user_id?: string | null
          assignee_role?: string
          assignment_mode?: string
          attachment_label?: string | null
          attachment_url?: string | null
          category?: string
          collective_id?: string | null
          created_at?: string
          created_by: string
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string | null
          event_offset_days?: number | null
          id?: string
          is_active?: boolean
          schedule_type: string
          sort_order?: number
          survey_id?: string | null
          title: string
          updated_at?: string
          use_dynamic_timeline?: boolean
        }
        Update: {
          assigned_to_user_id?: string | null
          assignee_role?: string
          assignment_mode?: string
          attachment_label?: string | null
          attachment_url?: string | null
          category?: string
          collective_id?: string | null
          created_at?: string
          created_by?: string
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string | null
          event_offset_days?: number | null
          id?: string
          is_active?: boolean
          schedule_type?: string
          sort_order?: number
          survey_id?: string | null
          title?: string
          updated_at?: string
          use_dynamic_timeline?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_collective_id_fkey"
            columns: ["collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_rules: {
        Row: {
          activity_type_filter:
            | Database["public"]["Enums"]["activity_type"]
            | null
          anchor: Database["public"]["Enums"]["timeline_anchor"]
          created_at: string | null
          display_label: string | null
          id: string
          lookahead_days: number
          match_all_events: boolean
          offset_days: number
          series_id_filter: string | null
          template_id: string
          updated_at: string | null
        }
        Insert: {
          activity_type_filter?:
            | Database["public"]["Enums"]["activity_type"]
            | null
          anchor?: Database["public"]["Enums"]["timeline_anchor"]
          created_at?: string | null
          display_label?: string | null
          id?: string
          lookahead_days?: number
          match_all_events?: boolean
          offset_days?: number
          series_id_filter?: string | null
          template_id: string
          updated_at?: string | null
        }
        Update: {
          activity_type_filter?:
            | Database["public"]["Enums"]["activity_type"]
            | null
          anchor?: Database["public"]["Enums"]["timeline_anchor"]
          created_at?: string | null
          display_label?: string | null
          id?: string
          lookahead_days?: number
          match_all_events?: boolean
          offset_days?: number
          series_id_filter?: string | null
          template_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timeline_rules_series_id_filter_fkey"
            columns: ["series_id_filter"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: true
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      update_reads: {
        Row: {
          id: string
          read_at: string | null
          update_id: string
          user_id: string
        }
        Insert: {
          id?: string
          read_at?: string | null
          update_id: string
          user_id: string
        }
        Update: {
          id?: string
          read_at?: string | null
          update_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "update_reads_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "updates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "update_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "update_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      updates: {
        Row: {
          author_id: string | null
          content: string
          created_at: string | null
          id: string
          image_url: string | null
          image_urls: string[] | null
          is_pinned: boolean | null
          priority: Database["public"]["Enums"]["update_priority"] | null
          target_audience: Database["public"]["Enums"]["update_target"] | null
          target_collective_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          is_pinned?: boolean | null
          priority?: Database["public"]["Enums"]["update_priority"] | null
          target_audience?: Database["public"]["Enums"]["update_target"] | null
          target_collective_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          is_pinned?: boolean | null
          priority?: Database["public"]["Enums"]["update_priority"] | null
          target_audience?: Database["public"]["Enums"]["update_target"] | null
          target_collective_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "updates_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "updates_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "updates_target_collective_id_fkey"
            columns: ["target_collective_id"]
            isOneToOne: false
            referencedRelation: "collectives"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      event_hosts: {
        Row: {
          collective_id: string | null
          event_id: string | null
          host_added_at: string | null
          host_count: number | null
          host_index: number | null
        }
        Relationships: []
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
          interests: string[] | null
          membership_level: string | null
          onboarding_completed: boolean | null
          points: number | null
          pronouns: string | null
          role: Database["public"]["Enums"]["user_role"] | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          interests?: string[] | null
          membership_level?: string | null
          onboarding_completed?: boolean | null
          points?: number | null
          pronouns?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          interests?: string[] | null
          membership_level?: string | null
          onboarding_completed?: boolean | null
          points?: number | null
          pronouns?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      accept_referral: { Args: { referral_code: string }; Returns: undefined }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      adjust_variant_stock: {
        Args: {
          p_adjustment: number
          p_product_id: string
          p_variant_key: string
        }
        Returns: undefined
      }
      admin_list_users:
        | {
            Args: {
              offset_val?: number
              result_limit?: number
              role_filter?: string
              search_term?: string
            }
            Returns: {
              avatar_url: string
              collective_count: number
              created_at: string
              display_name: string
              email: string
              id: string
              last_sign_in_at: string
              role: string
            }[]
          }
        | {
            Args: {
              result_limit?: number
              role_filter?: string
              search_term?: string
            }
            Returns: {
              avatar_url: string
              created_at: string
              display_name: string
              email: string
              id: string
              is_suspended: boolean
              role: string
            }[]
          }
      award_points: {
        Args: {
          p_amount: number
          p_event_id?: string
          p_reason: string
          p_user_id: string
        }
        Returns: undefined
      }
      check_chat_rate_limit: {
        Args: { p_collective_id: string; p_user_id: string }
        Returns: boolean
      }
      check_user_suspended: { Args: { uid: string }; Returns: Json }
      cleanup_deleted_accounts: { Args: never; Returns: number }
      cleanup_expired_reservations: { Args: never; Returns: number }
      cron_excel_from_sync: { Args: never; Returns: undefined }
      cron_excel_to_sync: { Args: never; Returns: undefined }
      decrement_stock: {
        Args: {
          p_product_id: string
          p_quantity: number
          p_variant_key: string
        }
        Returns: undefined
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      email_subscriber_count: { Args: never; Returns: number }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      event_host_count: { Args: { p_event_id: string }; Returns: number }
      expire_stale_pending_tickets: { Args: never; Returns: number }
      generate_event_check_in_code: { Args: never; Returns: string }
      generate_ticket_code: { Args: never; Returns: string }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_admin_system_stats: { Args: never; Returns: Json }
      get_available_stock: {
        Args: {
          p_exclude_user_id?: string
          p_product_id: string
          p_variant_key: string
        }
        Returns: number
      }
      get_charity_impact_report: {
        Args: { p_date_from: string; p_date_to: string; p_scope?: string }
        Returns: Json
      }
      get_collective_leaderboard: {
        Args: { p_period?: string }
        Returns: {
          collective_id: string
          collective_name: string
          cover_image_url: string
          total_events: number
          total_hours: number
          total_rubbish_kg: number
          total_trees: number
        }[]
      }
      get_collective_stats: { Args: { p_collective_id: string }; Returns: Json }
      get_events_within_radius: {
        Args: {
          p_lat: number
          p_limit?: number
          p_lng: number
          p_radius_km?: number
        }
        Returns: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          address: string | null
          capacity: number | null
          check_in_code: string | null
          checkin_window_minutes: number | null
          collective_id: string
          cover_image_position_x: number
          cover_image_position_y: number
          cover_image_url: string | null
          created_at: string | null
          created_by: string | null
          date_end: string | null
          date_start: string
          description: string | null
          external_registration_url: string | null
          id: string
          is_external_collaboration: boolean | null
          is_public: boolean | null
          is_ticketed: boolean | null
          location_point: unknown
          series_id: string | null
          status: Database["public"]["Enums"]["event_status"] | null
          title: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_leaderboard: {
        Args: { p_collective_id: string; p_period?: string }
        Returns: {
          avatar_url: string
          display_name: string
          events_attended: number
          total_points: number
          user_id: string
        }[]
      }
      get_national_stats: { Args: never; Returns: Json }
      get_product_available_stock: {
        Args: { p_exclude_user_id?: string; p_product_id: string }
        Returns: Json
      }
      get_profile_protected_fields: {
        Args: { uid: string }
        Returns: {
          is_suspended: boolean
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      get_user_impact_stats: { Args: { p_user_id: string }; Returns: Json }
      get_user_profile_v1: { Args: { target_user_id: string }; Returns: Json }
      gettransactionid: { Args: never; Returns: unknown }
      handle_announcement_rsvp: {
        Args: { p_event_id: string; p_response: string }
        Returns: Json
      }
      increment_promo_uses: {
        Args: { p_max_uses: number; p_promo_id: string }
        Returns: undefined
      }
      increment_stock: {
        Args: {
          p_product_id: string
          p_quantity: number
          p_variant_key: string
        }
        Returns: undefined
      }
      invite_collective_to_collaborate: {
        Args: {
          p_collective_id: string
          p_event_id: string
          p_host_collective_id: string
          p_message?: string
        }
        Returns: string
      }
      invite_collective_to_event: {
        Args: { p_collective_id: string; p_event_id: string }
        Returns: undefined
      }
      is_admin: { Args: { uid: string }; Returns: boolean }
      is_admin_or_staff: { Args: { uid: string }; Returns: boolean }
      is_collective_leader_or_above: {
        Args: { cid: string; uid: string }
        Returns: boolean
      }
      is_collective_member: {
        Args: { cid: string; uid: string }
        Returns: boolean
      }
      is_collective_staff: {
        Args: { cid: string; uid: string }
        Returns: boolean
      }
      is_collective_staff_or_above: { Args: { uid: string }; Returns: boolean }
      is_fellow_collective_member: {
        Args: { caller_uid: string; target_collective_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { uid: string }; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      recover_pending_deletion: { Args: { uid: string }; Returns: undefined }
      release_all_reservations: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      release_reservation: {
        Args: { p_user_id: string; p_variant_key: string }
        Returns: undefined
      }
      reserve_event_ticket: {
        Args: {
          p_event_id: string
          p_quantity?: number
          p_stripe_session_id?: string
          p_ticket_type_id: string
          p_user_id: string
        }
        Returns: string
      }
      reserve_stock: {
        Args: {
          p_duration_minutes?: number
          p_product_id: string
          p_quantity: number
          p_user_id: string
          p_variant_key: string
        }
        Returns: Json
      }
      resolve_campaign_audience: {
        Args: {
          p_collective_ids: string[]
          p_tag_ids: string[]
          p_target_all: boolean
        }
        Returns: {
          email: string
          profile_id: string
        }[]
      }
      respond_to_collaboration: {
        Args: { p_accept: boolean; p_collaboration_id: string }
        Returns: undefined
      }
      role_rank: { Args: { r: string }; Returns: number }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      sync_auto_tags: { Args: never; Returns: undefined }
      sync_variant_inventory: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      unlockrows: { Args: { "": string }; Returns: number }
      update_event_location: {
        Args: { p_event_id: string; p_lat: number; p_lng: number }
        Returns: undefined
      }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      activity_type:
        | "shore_cleanup"
        | "tree_planting"
        | "land_regeneration"
        | "nature_walk"
        | "camp_out"
        | "retreat"
        | "film_screening"
        | "marine_restoration"
        | "workshop"
        | "clean_up"
        | "ecosystem_restoration"
        | "nature_hike"
        | "spotlighting"
        | "other"
      collective_role:
        | "member"
        | "assist_leader"
        | "co_leader"
        | "leader"
        | "participant"
        | "manager"
        | "admin"
      dev_assignment_scope: "collective" | "individual"
      dev_category: "learning" | "leadership_development" | "onboarding"
      dev_content_type: "text" | "video" | "file" | "slideshow" | "quiz"
      dev_module_status: "draft" | "published" | "archived"
      dev_progress_status: "not_started" | "in_progress" | "completed"
      dev_question_type:
        | "multiple_choice"
        | "multi_select"
        | "true_false"
        | "short_answer"
      event_status: "draft" | "published" | "cancelled" | "completed"
      order_status:
        | "pending"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "refunded"
      promo_type: "percentage" | "flat" | "free_shipping"
      registration_status:
        | "registered"
        | "waitlisted"
        | "cancelled"
        | "attended"
        | "invited"
      report_status: "pending" | "approved" | "removed" | "dismissed"
      timeline_anchor: "next_event" | "next_event_of_type" | "event_series"
      update_priority: "normal" | "urgent"
      update_target: "all" | "leaders" | "collective_specific"
      user_role:
        | "participant"
        | "national_leader"
        | "manager"
        | "admin"
        | "assist_leader"
        | "co_leader"
        | "leader"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_type: [
        "shore_cleanup",
        "tree_planting",
        "land_regeneration",
        "nature_walk",
        "camp_out",
        "retreat",
        "film_screening",
        "marine_restoration",
        "workshop",
        "clean_up",
        "ecosystem_restoration",
        "nature_hike",
        "spotlighting",
        "other",
      ],
      collective_role: [
        "member",
        "assist_leader",
        "co_leader",
        "leader",
        "participant",
        "manager",
        "admin",
      ],
      dev_assignment_scope: ["collective", "individual"],
      dev_category: ["learning", "leadership_development", "onboarding"],
      dev_content_type: ["text", "video", "file", "slideshow", "quiz"],
      dev_module_status: ["draft", "published", "archived"],
      dev_progress_status: ["not_started", "in_progress", "completed"],
      dev_question_type: [
        "multiple_choice",
        "multi_select",
        "true_false",
        "short_answer",
      ],
      event_status: ["draft", "published", "cancelled", "completed"],
      order_status: [
        "pending",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      promo_type: ["percentage", "flat", "free_shipping"],
      registration_status: [
        "registered",
        "waitlisted",
        "cancelled",
        "attended",
        "invited",
      ],
      report_status: ["pending", "approved", "removed", "dismissed"],
      timeline_anchor: ["next_event", "next_event_of_type", "event_series"],
      update_priority: ["normal", "urgent"],
      update_target: ["all", "leaders", "collective_specific"],
      user_role: [
        "participant",
        "national_leader",
        "manager",
        "admin",
        "assist_leader",
        "co_leader",
        "leader",
      ],
    },
  },
} as const
