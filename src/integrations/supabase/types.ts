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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointment_participants: {
        Row: {
          appointment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_participants_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_at: string | null
          id: string
          location: string | null
          project_id: string | null
          start_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          title: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at?: string | null
          id?: string
          location?: string | null
          project_id?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at?: string | null
          id?: string
          location?: string | null
          project_id?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_history: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          changes: Json | null
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          changes?: Json | null
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          changes?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          city: string | null
          cnpj: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          neighborhood: string | null
          state: string | null
          status: Database["public"]["Enums"]["company_status"]
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          cnpj?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          neighborhood?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          cnpj?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          neighborhood?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      external_collaborators: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      iga_attachments: {
        Row: {
          company_id: string
          created_at: string
          file_name: string
          id: string
          metadata: Json
          mime_type: string | null
          object_id: string | null
          object_type: string
          size_bytes: number | null
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          file_name: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          object_id?: string | null
          object_type: string
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          file_name?: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          object_id?: string | null
          object_type?: string
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iga_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "iga_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      iga_audit_events: {
        Row: {
          action: Database["public"]["Enums"]["iga_audit_action"]
          actor_id: string | null
          after_state: Json | null
          before_state: Json | null
          company_id: string | null
          context: Json
          correlation_id: string | null
          created_at: string
          id: string
          object_id: string | null
          object_type: string
        }
        Insert: {
          action: Database["public"]["Enums"]["iga_audit_action"]
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          company_id?: string | null
          context?: Json
          correlation_id?: string | null
          created_at?: string
          id?: string
          object_id?: string | null
          object_type: string
        }
        Update: {
          action?: Database["public"]["Enums"]["iga_audit_action"]
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          company_id?: string | null
          context?: Json
          correlation_id?: string | null
          created_at?: string
          id?: string
          object_id?: string | null
          object_type?: string
        }
        Relationships: []
      }
      iga_companies: {
        Row: {
          cnpj: string | null
          created_at: string
          created_by: string | null
          id: string
          is_operator: boolean
          legal_name: string
          status: Database["public"]["Enums"]["iga_entity_status"]
          trade_name: string | null
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_operator?: boolean
          legal_name: string
          status?: Database["public"]["Enums"]["iga_entity_status"]
          trade_name?: string | null
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_operator?: boolean
          legal_name?: string
          status?: Database["public"]["Enums"]["iga_entity_status"]
          trade_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      iga_idempotency_keys: {
        Row: {
          company_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          idem_key: string
          request_hash: string
          response: Json | null
          status: Database["public"]["Enums"]["iga_idem_status"]
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          idem_key: string
          request_hash: string
          response?: Json | null
          status?: Database["public"]["Enums"]["iga_idem_status"]
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          idem_key?: string
          request_hash?: string
          response?: Json | null
          status?: Database["public"]["Enums"]["iga_idem_status"]
        }
        Relationships: []
      }
      iga_memberships: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          status: Database["public"]["Enums"]["iga_entity_status"]
          unit_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          status?: Database["public"]["Enums"]["iga_entity_status"]
          unit_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          status?: Database["public"]["Enums"]["iga_entity_status"]
          unit_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iga_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "iga_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iga_memberships_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "iga_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iga_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "iga_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      iga_notifications: {
        Row: {
          body: string | null
          category: string
          company_id: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          category?: string
          company_id?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          category?: string
          company_id?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iga_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "iga_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iga_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "iga_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      iga_permissions: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
          module: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          id?: string
          module: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
          module?: string
        }
        Relationships: []
      }
      iga_policy_versions: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_until: string | null
          id: string
          payload: Json
          policy_key: string
          version: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_until?: string | null
          id?: string
          payload?: Json
          policy_key: string
          version: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_until?: string | null
          id?: string
          payload?: Json
          policy_key?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "iga_policy_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "iga_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      iga_profiles: {
        Row: {
          created_at: string
          disabled_at: string | null
          disabled_by: string | null
          email: string | null
          full_name: string | null
          id: string
          status: Database["public"]["Enums"]["iga_user_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          status?: Database["public"]["Enums"]["iga_user_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          status?: Database["public"]["Enums"]["iga_user_status"]
          updated_at?: string
        }
        Relationships: []
      }
      iga_role_assignments: {
        Row: {
          company_id: string | null
          created_at: string
          grant_reason: string | null
          granted_by: string | null
          id: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          role_id: string
          scope_type: Database["public"]["Enums"]["iga_scope_type"]
          unit_id: string | null
          updated_at: string
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          grant_reason?: string | null
          granted_by?: string | null
          id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role_id: string
          scope_type: Database["public"]["Enums"]["iga_scope_type"]
          unit_id?: string | null
          updated_at?: string
          user_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          grant_reason?: string | null
          granted_by?: string | null
          id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role_id?: string
          scope_type?: Database["public"]["Enums"]["iga_scope_type"]
          unit_id?: string | null
          updated_at?: string
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iga_role_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "iga_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iga_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "iga_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iga_role_assignments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "iga_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iga_role_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "iga_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      iga_role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iga_role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "iga_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iga_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "iga_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      iga_roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_admin_role: boolean
          is_system: boolean
          name: string
          scope_level: Database["public"]["Enums"]["iga_scope_type"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_admin_role?: boolean
          is_system?: boolean
          name: string
          scope_level?: Database["public"]["Enums"]["iga_scope_type"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_admin_role?: boolean
          is_system?: boolean
          name?: string
          scope_level?: Database["public"]["Enums"]["iga_scope_type"]
          updated_at?: string
        }
        Relationships: []
      }
      iga_sequences: {
        Row: {
          company_id: string | null
          current_value: number
          id: string
          period: string
          seq_key: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          current_value?: number
          id?: string
          period?: string
          seq_key: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          current_value?: number
          id?: string
          period?: string
          seq_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iga_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "iga_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      iga_settings: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "iga_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "iga_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      iga_units: {
        Row: {
          code: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["iga_entity_status"]
          updated_at: string
        }
        Insert: {
          code?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["iga_entity_status"]
          updated_at?: string
        }
        Update: {
          code?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["iga_entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iga_units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "iga_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          job_title: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          job_title?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          job_title?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          notes: string | null
          platform: string
          project_id: string
          updated_at: string
          url: string | null
          username: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          notes?: string | null
          platform: string
          project_id: string
          updated_at?: string
          url?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          notes?: string | null
          platform?: string
          project_id?: string
          updated_at?: string
          url?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_accounts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_credits: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          entry_date: string
          id: string
          notes: string | null
          project_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          project_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_credits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_custom_field_definitions: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          field_type: Database["public"]["Enums"]["custom_field_type"]
          id: string
          name: string
          options: Json | null
          position: number
          required: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          field_type?: Database["public"]["Enums"]["custom_field_type"]
          id?: string
          name: string
          options?: Json | null
          position?: number
          required?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          field_type?: Database["public"]["Enums"]["custom_field_type"]
          id?: string
          name?: string
          options?: Json | null
          position?: number
          required?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      project_custom_field_values: {
        Row: {
          created_at: string
          created_by: string | null
          field_definition_id: string
          id: string
          project_id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          field_definition_id: string
          id?: string
          project_id: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          field_definition_id?: string
          id?: string
          project_id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_custom_field_values_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "project_custom_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_custom_field_values_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_emails: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          notes: string | null
          project_id: string
          provider: string | null
          purpose: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          notes?: string | null
          project_id: string
          provider?: string | null
          purpose?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          notes?: string | null
          project_id?: string
          provider?: string | null
          purpose?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_emails_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_github_repos: {
        Row: {
          created_at: string
          created_by: string | null
          default_branch: string | null
          id: string
          notes: string | null
          owner: string | null
          project_id: string
          repo_name: string | null
          status: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_branch?: string | null
          id?: string
          notes?: string | null
          owner?: string | null
          project_id: string
          repo_name?: string | null
          status?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_branch?: string | null
          id?: string
          notes?: string | null
          owner?: string | null
          project_id?: string
          repo_name?: string | null
          status?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_github_repos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_links: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          project_id: string
          updated_at: string
          url: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          project_id: string
          updated_at?: string
          url: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_lovable: {
        Row: {
          account_email: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          project_id: string
          project_url: string | null
          public_url: string | null
          updated_at: string
          workspace: string | null
        }
        Insert: {
          account_email?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          project_id: string
          project_url?: string | null
          public_url?: string | null
          updated_at?: string
          workspace?: string | null
        }
        Update: {
          account_email?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          project_url?: string | null
          public_url?: string | null
          updated_at?: string
          workspace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_lovable_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_prompts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          project_id: string
          prompt_date: string
          prompt_type: Database["public"]["Enums"]["prompt_type"]
          purpose: string | null
          sent_to_lovable_at: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          project_id: string
          prompt_date?: string
          prompt_type?: Database["public"]["Enums"]["prompt_type"]
          purpose?: string | null
          sent_to_lovable_at?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          prompt_date?: string
          prompt_type?: Database["public"]["Enums"]["prompt_type"]
          purpose?: string | null
          sent_to_lovable_at?: string | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_prompts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_shares: {
        Row: {
          created_at: string
          created_by: string | null
          external_id: string | null
          id: string
          permission: Database["public"]["Enums"]["task_permission"]
          project_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          permission?: Database["public"]["Enums"]["task_permission"]
          project_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          permission?: Database["public"]["Enums"]["task_permission"]
          project_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_shares_external_id_fkey"
            columns: ["external_id"]
            isOneToOne: false
            referencedRelation: "external_collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          last_activity_at: string
          name: string
          next_action: string | null
          owner_id: string | null
          phase: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
          value: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          last_activity_at?: string
          name: string
          next_action?: string | null
          owner_id?: string | null
          phase?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          value?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          last_activity_at?: string
          name?: string
          next_action?: string | null
          owner_id?: string | null
          phase?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          storage_path: string | null
          task_id: string
          type: Database["public"]["Enums"]["attachment_type"]
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          storage_path?: string | null
          task_id: string
          type: Database["public"]["Enums"]["attachment_type"]
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          storage_path?: string | null
          task_id?: string
          type?: Database["public"]["Enums"]["attachment_type"]
          url?: string
        }
        Relationships: []
      }
      task_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_shares: {
        Row: {
          created_at: string
          created_by: string | null
          external_id: string | null
          id: string
          permission: Database["public"]["Enums"]["task_permission"]
          task_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          permission?: Database["public"]["Enums"]["task_permission"]
          task_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          permission?: Database["public"]["Enums"]["task_permission"]
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_shares_external_id_fkey"
            columns: ["external_id"]
            isOneToOne: false
            referencedRelation: "external_collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_shares_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_status: Database["public"]["Enums"]["task_status"]
          old_status: Database["public"]["Enums"]["task_status"] | null
          task_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status: Database["public"]["Enums"]["task_status"]
          old_status?: Database["public"]["Enums"]["task_status"] | null
          task_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status?: Database["public"]["Enums"]["task_status"]
          old_status?: Database["public"]["Enums"]["task_status"] | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_status_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          name: string
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_access: {
        Row: {
          created_at: string
          id: string
          module: Database["public"]["Enums"]["app_module"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          module: Database["public"]["Enums"]["app_module"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          module?: Database["public"]["Enums"]["app_module"]
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      iga_bootstrap_profile: { Args: { _full_name?: string }; Returns: Json }
      iga_can_access_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      iga_claim_idempotency: {
        Args: { _company_id: string; _idem_key: string; _request_hash: string }
        Returns: Json
      }
      iga_company_ids: { Args: { _user_id: string }; Returns: string[] }
      iga_complete_idempotency: {
        Args: { _id: string; _ok?: boolean; _response: Json }
        Returns: undefined
      }
      iga_has_any_permission: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
      iga_has_permission: {
        Args: {
          _company_id?: string
          _perm: string
          _unit_id?: string
          _user_id: string
        }
        Returns: boolean
      }
      iga_is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      iga_next_sequence: {
        Args: { _company_id: string; _period?: string; _seq_key: string }
        Returns: number
      }
      task_has_permission: {
        Args: {
          _min_perm: Database["public"]["Enums"]["task_permission"]
          _task_id: string
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_module:
        | "companies"
        | "projects"
        | "tasks"
        | "appointments"
        | "reports"
      app_role: "owner" | "collaborator" | "viewer"
      appointment_status:
        | "scheduled"
        | "in_progress"
        | "done"
        | "cancelled"
        | "to_schedule"
      attachment_type: "file" | "link"
      company_status: "active" | "inactive"
      custom_field_type:
        | "text"
        | "textarea"
        | "number"
        | "currency"
        | "date"
        | "datetime"
        | "boolean"
        | "select"
        | "multiselect"
        | "url"
        | "email"
      iga_audit_action:
        | "created"
        | "updated"
        | "deleted"
        | "granted"
        | "revoked"
        | "login"
        | "access_denied"
        | "other"
      iga_entity_status: "active" | "inactive"
      iga_idem_status: "in_progress" | "completed" | "failed"
      iga_scope_type: "global" | "company" | "unit"
      iga_user_status: "active" | "disabled" | "pending"
      project_status:
        | "planning"
        | "in_progress"
        | "paused"
        | "completed"
        | "cancelled"
      prompt_type:
        | "initial"
        | "adjustment"
        | "fix"
        | "feature"
        | "security"
        | "database"
        | "ux"
        | "audit"
        | "tests"
        | "docs"
        | "staging"
        | "other"
      task_permission: "view" | "comment" | "edit"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status:
        | "pending"
        | "started"
        | "in_progress"
        | "paused"
        | "completed"
    }
    CompositeTypes: {
      [_ in never]: never
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
      app_module: ["companies", "projects", "tasks", "appointments", "reports"],
      app_role: ["owner", "collaborator", "viewer"],
      appointment_status: [
        "scheduled",
        "in_progress",
        "done",
        "cancelled",
        "to_schedule",
      ],
      attachment_type: ["file", "link"],
      company_status: ["active", "inactive"],
      custom_field_type: [
        "text",
        "textarea",
        "number",
        "currency",
        "date",
        "datetime",
        "boolean",
        "select",
        "multiselect",
        "url",
        "email",
      ],
      iga_audit_action: [
        "created",
        "updated",
        "deleted",
        "granted",
        "revoked",
        "login",
        "access_denied",
        "other",
      ],
      iga_entity_status: ["active", "inactive"],
      iga_idem_status: ["in_progress", "completed", "failed"],
      iga_scope_type: ["global", "company", "unit"],
      iga_user_status: ["active", "disabled", "pending"],
      project_status: [
        "planning",
        "in_progress",
        "paused",
        "completed",
        "cancelled",
      ],
      prompt_type: [
        "initial",
        "adjustment",
        "fix",
        "feature",
        "security",
        "database",
        "ux",
        "audit",
        "tests",
        "docs",
        "staging",
        "other",
      ],
      task_permission: ["view", "comment", "edit"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["pending", "started", "in_progress", "paused", "completed"],
    },
  },
} as const
