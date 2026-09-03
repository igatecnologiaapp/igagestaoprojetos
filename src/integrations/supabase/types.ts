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
      app_permissions: {
        Row: {
          category: string
          created_at: string
          description: string
          key: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          key: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          key?: string
        }
        Relationships: []
      }
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
      finance_categories: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          kind: string
          name: string
          parent_id: string | null
          position: number
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name: string
          parent_id?: string | null
          position?: number
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name?: string
          parent_id?: string | null
          position?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_services: {
        Row: {
          amount: number | null
          auto_renew: boolean
          billing_day: number | null
          category_id: string | null
          contracted_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          default_project_id: string | null
          description: string | null
          expires_at: string | null
          id: string
          is_shared: boolean
          name: string
          notes: string | null
          plan: string | null
          project_account_id: string | null
          recurrence: Database["public"]["Enums"]["finance_recurrence"]
          renews_at: string | null
          status: Database["public"]["Enums"]["finance_service_status"]
          updated_at: string
          vendor_id: string
        }
        Insert: {
          amount?: number | null
          auto_renew?: boolean
          billing_day?: number | null
          category_id?: string | null
          contracted_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_project_id?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_shared?: boolean
          name: string
          notes?: string | null
          plan?: string | null
          project_account_id?: string | null
          recurrence?: Database["public"]["Enums"]["finance_recurrence"]
          renews_at?: string | null
          status?: Database["public"]["Enums"]["finance_service_status"]
          updated_at?: string
          vendor_id: string
        }
        Update: {
          amount?: number | null
          auto_renew?: boolean
          billing_day?: number | null
          category_id?: string | null
          contracted_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_project_id?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_shared?: boolean
          name?: string
          notes?: string | null
          plan?: string | null
          project_account_id?: string | null
          recurrence?: Database["public"]["Enums"]["finance_recurrence"]
          renews_at?: string | null
          status?: Database["public"]["Enums"]["finance_service_status"]
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_services_default_project_id_fkey"
            columns: ["default_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_services_project_account_id_fkey"
            columns: ["project_account_id"]
            isOneToOne: false
            referencedRelation: "project_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_services_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "finance_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_vendors: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          default_currency: string
          document: string | null
          id: string
          legal_name: string | null
          name: string
          notes: string | null
          status: Database["public"]["Enums"]["finance_entity_status"]
          updated_at: string
          website: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: string
          document?: string | null
          id?: string
          legal_name?: string | null
          name: string
          notes?: string | null
          status?: Database["public"]["Enums"]["finance_entity_status"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: string
          document?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["finance_entity_status"]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
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
      project_development_records: {
        Row: {
          commit_ref: string | null
          created_at: string
          created_by: string | null
          description: string | null
          environment: string | null
          event_date: string
          id: string
          notes: string | null
          project_id: string
          record_type: Database["public"]["Enums"]["dev_record_type"]
          responsible_user_id: string | null
          result: string | null
          title: string
          updated_at: string
          version_ref: string | null
        }
        Insert: {
          commit_ref?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          environment?: string | null
          event_date?: string
          id?: string
          notes?: string | null
          project_id: string
          record_type: Database["public"]["Enums"]["dev_record_type"]
          responsible_user_id?: string | null
          result?: string | null
          title: string
          updated_at?: string
          version_ref?: string | null
        }
        Update: {
          commit_ref?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          environment?: string | null
          event_date?: string
          id?: string
          notes?: string | null
          project_id?: string
          record_type?: Database["public"]["Enums"]["dev_record_type"]
          responsible_user_id?: string | null
          result?: string | null
          title?: string
          updated_at?: string
          version_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_development_records_project_id_fkey"
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
          commit_ref: string | null
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
          commit_ref?: string | null
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
          commit_ref?: string | null
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
      project_technical_debts: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          identified_at: string
          impact: string | null
          origin: string | null
          priority: Database["public"]["Enums"]["tech_debt_priority"]
          project_id: string
          resolution: string | null
          resolved_at: string | null
          responsible_user_id: string | null
          status: Database["public"]["Enums"]["tech_debt_status"]
          title: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          identified_at?: string
          impact?: string | null
          origin?: string | null
          priority?: Database["public"]["Enums"]["tech_debt_priority"]
          project_id: string
          resolution?: string | null
          resolved_at?: string | null
          responsible_user_id?: string | null
          status?: Database["public"]["Enums"]["tech_debt_status"]
          title: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          identified_at?: string
          impact?: string | null
          origin?: string | null
          priority?: Database["public"]["Enums"]["tech_debt_priority"]
          project_id?: string
          resolution?: string | null
          resolved_at?: string | null
          responsible_user_id?: string | null
          status?: Database["public"]["Enums"]["tech_debt_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_technical_debts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          permission_key?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "app_permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      security_access_log: {
        Row: {
          action: string
          actor_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          occurred_at: string
          origin: string | null
          project_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          origin?: string | null
          project_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          origin?: string | null
          project_id?: string | null
        }
        Relationships: []
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
      user_permission_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          granted: boolean
          id: string
          permission_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          granted?: boolean
          id?: string
          permission_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          granted?: boolean
          id?: string
          permission_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "app_permissions"
            referencedColumns: ["key"]
          },
        ]
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
      can_edit_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_edit_task: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      can_modify_task_files: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_appointment: {
        Args: { _appointment_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_project_dossier: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_task: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_appointment_participant: {
        Args: { _appointment_id: string; _user_id: string }
        Returns: boolean
      }
      shares_workspace_with: {
        Args: { _target: string; _viewer: string }
        Returns: boolean
      }
      task_file_task_id: { Args: { _object_name: string }; Returns: string }
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
      dev_record_type:
        | "decision"
        | "version"
        | "test"
        | "homologation"
        | "deployment"
      finance_entity_status: "active" | "inactive"
      finance_recurrence:
        | "monthly"
        | "quarterly"
        | "semiannual"
        | "annual"
        | "one_off"
      finance_service_status: "active" | "paused" | "cancelled" | "expired"
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
      tech_debt_priority: "low" | "medium" | "high" | "critical"
      tech_debt_status:
        | "open"
        | "analysis"
        | "planned"
        | "resolved"
        | "accepted"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      dev_record_type: [
        "decision",
        "version",
        "test",
        "homologation",
        "deployment",
      ],
      finance_entity_status: ["active", "inactive"],
      finance_recurrence: [
        "monthly",
        "quarterly",
        "semiannual",
        "annual",
        "one_off",
      ],
      finance_service_status: ["active", "paused", "cancelled", "expired"],
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
      tech_debt_priority: ["low", "medium", "high", "critical"],
      tech_debt_status: ["open", "analysis", "planned", "resolved", "accepted"],
    },
  },
} as const
