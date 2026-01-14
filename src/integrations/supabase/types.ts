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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      accounting_accounts: {
        Row: {
          account_type: string
          address: string | null
          city: string | null
          contact_id: string | null
          created_at: string
          id: string
          name: string
          nif_cif: string | null
          postal_code: string | null
          province: string | null
          updated_at: string
        }
        Insert: {
          account_type: string
          address?: string | null
          city?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          name: string
          nif_cif?: string | null
          postal_code?: string | null
          province?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          address?: string | null
          city?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          name?: string
          nif_cif?: string | null
          postal_code?: string | null
          province?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_accounts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_documents: {
        Row: {
          created_at: string
          description: string | null
          document_url: string | null
          entry_id: string | null
          file_path: string | null
          file_size: number | null
          file_type: string | null
          id: string
          name: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          document_url?: string | null
          entry_id?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          name: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          document_url?: string | null
          entry_id?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          name?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_documents_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_entries: {
        Row: {
          budget_id: string
          code: string
          created_at: string
          description: string
          entry_date: string
          entry_type: string | null
          expense_account_id: string | null
          id: string
          supplier_id: string | null
          total_amount: number
          updated_at: string
          vat_rate: number | null
        }
        Insert: {
          budget_id: string
          code?: string
          created_at?: string
          description: string
          entry_date?: string
          entry_type?: string | null
          expense_account_id?: string | null
          id?: string
          supplier_id?: string | null
          total_amount?: number
          updated_at?: string
          vat_rate?: number | null
        }
        Update: {
          budget_id?: string
          code?: string
          created_at?: string
          description?: string
          entry_date?: string
          entry_type?: string | null
          expense_account_id?: string | null
          id?: string
          supplier_id?: string | null
          total_amount?: number
          updated_at?: string
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_entries_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_entries_expense_account_id_fkey"
            columns: ["expense_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_entries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_entry_lines: {
        Row: {
          account_id: string
          code: string
          created_at: string
          credit_amount: number
          debit_amount: number
          description: string | null
          entry_id: string
          id: string
          line_date: string
          updated_at: string
        }
        Insert: {
          account_id: string
          code?: string
          created_at?: string
          credit_amount?: number
          debit_amount?: number
          description?: string | null
          entry_id: string
          id?: string
          line_date: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          code?: string
          created_at?: string
          credit_amount?: number
          debit_amount?: number
          description?: string | null
          entry_id?: string
          id?: string
          line_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_entry_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_activities: {
        Row: {
          budget_id: string
          code: string
          created_at: string
          description: string | null
          duration_days: number | null
          end_date: string | null
          id: string
          measurement_id: string | null
          measurement_unit: string | null
          name: string
          opciones: string[]
          phase_id: string | null
          start_date: string | null
          tolerance_days: number | null
          updated_at: string
          uses_measurement: boolean
        }
        Insert: {
          budget_id: string
          code: string
          created_at?: string
          description?: string | null
          duration_days?: number | null
          end_date?: string | null
          id?: string
          measurement_id?: string | null
          measurement_unit?: string | null
          name: string
          opciones?: string[]
          phase_id?: string | null
          start_date?: string | null
          tolerance_days?: number | null
          updated_at?: string
          uses_measurement?: boolean
        }
        Update: {
          budget_id?: string
          code?: string
          created_at?: string
          description?: string | null
          duration_days?: number | null
          end_date?: string | null
          id?: string
          measurement_id?: string | null
          measurement_unit?: string | null
          name?: string
          opciones?: string[]
          phase_id?: string | null
          start_date?: string | null
          tolerance_days?: number | null
          updated_at?: string
          uses_measurement?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "budget_activities_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_activities_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "budget_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_activities_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "budget_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_activity_files: {
        Row: {
          activity_id: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          uploaded_by: string | null
        }
        Insert: {
          activity_id: string
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          activity_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_activity_files_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "budget_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_activity_resources: {
        Row: {
          activity_id: string | null
          budget_id: string
          created_at: string | null
          description: string | null
          duration_days: number | null
          external_unit_cost: number | null
          id: string
          manual_units: number | null
          name: string
          related_units: number | null
          resource_type: string | null
          safety_margin_percent: number | null
          sales_margin_percent: number | null
          start_date: string | null
          task_status: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          activity_id?: string | null
          budget_id: string
          created_at?: string | null
          description?: string | null
          duration_days?: number | null
          external_unit_cost?: number | null
          id?: string
          manual_units?: number | null
          name: string
          related_units?: number | null
          resource_type?: string | null
          safety_margin_percent?: number | null
          sales_margin_percent?: number | null
          start_date?: string | null
          task_status?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_id?: string | null
          budget_id?: string
          created_at?: string | null
          description?: string | null
          duration_days?: number | null
          external_unit_cost?: number | null
          id?: string
          manual_units?: number | null
          name?: string
          related_units?: number | null
          resource_type?: string | null
          safety_margin_percent?: number | null
          sales_margin_percent?: number | null
          start_date?: string | null
          task_status?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_activity_resources_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "budget_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_activity_resources_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_concepts: {
        Row: {
          budget_id: string
          code: string | null
          created_at: string | null
          description: string | null
          id: string
          measurement_id: string | null
          name: string
          phase_id: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          budget_id: string
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          measurement_id?: string | null
          name: string
          phase_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          budget_id?: string
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          measurement_id?: string | null
          name?: string
          phase_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_concepts_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_concepts_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_concepts_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "budget_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_contacts: {
        Row: {
          budget_id: string
          contact_id: string
          contact_role: string
          created_at: string
          id: string
        }
        Insert: {
          budget_id: string
          contact_id: string
          contact_role: string
          created_at?: string
          id?: string
        }
        Update: {
          budget_id?: string
          contact_id?: string
          contact_role?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_contacts_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_items: {
        Row: {
          budget_id: string
          created_at: string | null
          id: string
          name: string
          quantity: number | null
          unit: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          budget_id: string
          created_at?: string | null
          id?: string
          name: string
          quantity?: number | null
          unit?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          budget_id?: string
          created_at?: string | null
          id?: string
          name?: string
          quantity?: number | null
          unit?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_measurement_relations: {
        Row: {
          created_at: string
          id: string
          measurement_id: string
          related_measurement_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          measurement_id: string
          related_measurement_id: string
        }
        Update: {
          created_at?: string
          id?: string
          measurement_id?: string
          related_measurement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_measurement_relations_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "budget_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_measurement_relations_related_measurement_id_fkey"
            columns: ["related_measurement_id"]
            isOneToOne: false
            referencedRelation: "budget_measurements"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_measurements: {
        Row: {
          budget_id: string
          created_at: string
          id: string
          manual_units: number | null
          measurement_unit: string | null
          name: string
          updated_at: string
        }
        Insert: {
          budget_id: string
          created_at?: string
          id?: string
          manual_units?: number | null
          measurement_unit?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          budget_id?: string
          created_at?: string
          id?: string
          manual_units?: number | null
          measurement_unit?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_measurements_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_phases: {
        Row: {
          budget_id: string
          code: string | null
          created_at: string | null
          duration_days: number | null
          estimated_end_date: string | null
          id: string
          name: string
          order_index: number | null
          parent_id: string | null
          start_date: string | null
          time_percent: number | null
          updated_at: string | null
        }
        Insert: {
          budget_id: string
          code?: string | null
          created_at?: string | null
          duration_days?: number | null
          estimated_end_date?: string | null
          id?: string
          name: string
          order_index?: number | null
          parent_id?: string | null
          start_date?: string | null
          time_percent?: number | null
          updated_at?: string | null
        }
        Update: {
          budget_id?: string
          code?: string | null
          created_at?: string | null
          duration_days?: number | null
          estimated_end_date?: string | null
          id?: string
          name?: string
          order_index?: number | null
          parent_id?: string | null
          start_date?: string | null
          time_percent?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_phases_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_phases_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "budget_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_predesigns: {
        Row: {
          budget_id: string
          content: string
          content_type: string
          created_at: string
          description: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          file_type: string | null
          id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          budget_id: string
          content: string
          content_type?: string
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          budget_id?: string
          content?: string
          content_type?: string
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_predesigns_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_resource_contacts: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          resource_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          resource_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_resource_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_resource_contacts_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "budget_activity_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_resource_images: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          resource_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          resource_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          resource_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_resource_images_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "budget_activity_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_resource_images_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_spaces: {
        Row: {
          budget_id: string
          created_at: string
          id: string
          level: string
          m2_built: number | null
          m2_livable: number | null
          name: string
          observations: string | null
          opciones: string[]
          space_type: string
          updated_at: string
        }
        Insert: {
          budget_id: string
          created_at?: string
          id?: string
          level?: string
          m2_built?: number | null
          m2_livable?: number | null
          name: string
          observations?: string | null
          opciones?: string[]
          space_type?: string
          updated_at?: string
        }
        Update: {
          budget_id?: string
          created_at?: string
          id?: string
          level?: string
          m2_built?: number | null
          m2_livable?: number | null
          name?: string
          observations?: string | null
          opciones?: string[]
          space_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_spaces_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_task_contacts: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_task_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_task_contacts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "budget_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_task_images: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          task_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_task_images_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "budget_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_task_images_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_tasks: {
        Row: {
          activity_id: string
          created_at: string
          description: string | null
          duration_days: number | null
          id: string
          name: string
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          description?: string | null
          duration_days?: number | null
          id?: string
          name: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          description?: string | null
          duration_days?: number | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_tasks_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "budget_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_work_area_activities: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          work_area_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          work_area_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          work_area_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_work_area_activities_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "budget_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_work_area_activities_work_area_id_fkey"
            columns: ["work_area_id"]
            isOneToOne: false
            referencedRelation: "budget_work_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_work_area_measurements: {
        Row: {
          created_at: string
          id: string
          measurement_id: string
          work_area_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          measurement_id: string
          work_area_id: string
        }
        Update: {
          created_at?: string
          id?: string
          measurement_id?: string
          work_area_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_work_area_measurements_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "budget_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_work_area_measurements_work_area_id_fkey"
            columns: ["work_area_id"]
            isOneToOne: false
            referencedRelation: "budget_work_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_work_areas: {
        Row: {
          area_id: string | null
          budget_id: string
          created_at: string
          id: string
          level: string
          name: string
          updated_at: string
          work_area: string
        }
        Insert: {
          area_id?: string | null
          budget_id: string
          created_at?: string
          id?: string
          level?: string
          name: string
          updated_at?: string
          work_area?: string
        }
        Update: {
          area_id?: string | null
          budget_id?: string
          created_at?: string
          id?: string
          level?: string
          name?: string
          updated_at?: string
          work_area?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_work_areas_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          email_signature: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          updated_at: string
          website: string | null
          whatsapp_phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          email_signature?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
          website?: string | null
          whatsapp_phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          email_signature?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
          website?: string | null
          whatsapp_phone?: string | null
        }
        Relationships: []
      }
      contact_form_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          project_id: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          project_id?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_form_attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      crm_communications: {
        Row: {
          communication_type: string
          contact_id: string | null
          content: string
          created_at: string
          created_by: string | null
          direction: string
          error_message: string | null
          id: string
          metadata: Json | null
          opened_at: string | null
          sent_at: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          communication_type?: string
          contact_id?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          direction?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          communication_type?: string
          contact_id?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_communications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_communications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contact_activities: {
        Row: {
          activity_id: string
          contact_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          activity_id: string
          contact_id: string
          created_at?: string | null
          id?: string
        }
        Update: {
          activity_id?: string
          contact_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contact_activities_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "crm_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contact_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contact_professional_activities: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          professional_activity_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          professional_activity_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          professional_activity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contact_professional_activiti_professional_activity_id_fkey"
            columns: ["professional_activity_id"]
            isOneToOne: false
            referencedRelation: "crm_professional_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contact_professional_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contact_relations: {
        Row: {
          contact_id_a: string
          contact_id_b: string
          created_at: string | null
          id: string
        }
        Insert: {
          contact_id_a: string
          contact_id_b: string
          created_at?: string | null
          id?: string
        }
        Update: {
          contact_id_a?: string
          contact_id_b?: string
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contact_relations_contact_id_a_fkey"
            columns: ["contact_id_a"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contact_relations_contact_id_b_fkey"
            columns: ["contact_id_b"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          address: string | null
          city: string | null
          contact_type: string
          country: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          logo_path: string | null
          name: string
          nif_dni: string | null
          observations: string | null
          phone: string | null
          postal_code: string | null
          professional_activity_id: string | null
          province: string | null
          secondary_phones: string[] | null
          status: string
          surname: string | null
          tags: string[] | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_type?: string
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          logo_path?: string | null
          name: string
          nif_dni?: string | null
          observations?: string | null
          phone?: string | null
          postal_code?: string | null
          professional_activity_id?: string | null
          province?: string | null
          secondary_phones?: string[] | null
          status?: string
          surname?: string | null
          tags?: string[] | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_type?: string
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          nif_dni?: string | null
          observations?: string | null
          phone?: string | null
          postal_code?: string | null
          professional_activity_id?: string | null
          province?: string | null
          secondary_phones?: string[] | null
          status?: string
          surname?: string | null
          tags?: string[] | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_professional_activity_id_fkey"
            columns: ["professional_activity_id"]
            isOneToOne: false
            referencedRelation: "crm_professional_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_management_contacts: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          management_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          management_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          management_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_management_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_management_contacts_management_id_fkey"
            columns: ["management_id"]
            isOneToOne: false
            referencedRelation: "crm_managements"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_managements: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          end_time: string | null
          id: string
          management_type: string
          start_time: string | null
          status: string
          target_date: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          management_type?: string
          start_time?: string | null
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          management_type?: string
          start_time?: string | null
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_managements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_opportunities: {
        Row: {
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_professional_activities: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      email_attachments: {
        Row: {
          created_at: string
          email_id: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
        }
        Update: {
          created_at?: string
          email_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_budget_assignments: {
        Row: {
          budget_id: string
          created_at: string
          email_id: string
          id: string
        }
        Insert: {
          budget_id: string
          created_at?: string
          email_id: string
          id?: string
        }
        Update: {
          budget_id?: string
          created_at?: string
          email_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_budget_assignments_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_budget_assignments_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaign_recipients: {
        Row: {
          campaign_id: string
          contact_id: string
          created_at: string
          error_message: string | null
          id: string
          opened_at: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          contact_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          failed_count: number | null
          id: string
          name: string
          opened_count: number | null
          scheduled_at: string | null
          sent_at: string | null
          sent_count: number | null
          status: string
          subject: string
          target_filters: Json | null
          template_id: string | null
          total_recipients: number | null
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          failed_count?: number | null
          id?: string
          name: string
          opened_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string
          subject: string
          target_filters?: Json | null
          template_id?: string | null
          total_recipients?: number | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          failed_count?: number | null
          id?: string
          name?: string
          opened_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string
          subject?: string
          target_filters?: Json | null
          template_id?: string | null
          total_recipients?: number | null
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
            foreignKeyName: "email_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          bcc_emails: string[] | null
          body_html: string | null
          body_text: string | null
          budget_id: string | null
          cc_emails: string[] | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          direction: string
          error_message: string | null
          external_id: string | null
          from_email: string
          from_name: string | null
          id: string
          is_read: boolean | null
          metadata: Json | null
          project_id: string | null
          read_at: string | null
          received_at: string | null
          sent_at: string | null
          snoozed_until: string | null
          status: string
          subject: string | null
          ticket_id: string | null
          to_emails: string[]
          updated_at: string
        }
        Insert: {
          bcc_emails?: string[] | null
          body_html?: string | null
          body_text?: string | null
          budget_id?: string | null
          cc_emails?: string[] | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          direction: string
          error_message?: string | null
          external_id?: string | null
          from_email: string
          from_name?: string | null
          id?: string
          is_read?: boolean | null
          metadata?: Json | null
          project_id?: string | null
          read_at?: string | null
          received_at?: string | null
          sent_at?: string | null
          snoozed_until?: string | null
          status?: string
          subject?: string | null
          ticket_id?: string | null
          to_emails: string[]
          updated_at?: string
        }
        Update: {
          bcc_emails?: string[] | null
          body_html?: string | null
          body_text?: string | null
          budget_id?: string | null
          cc_emails?: string[] | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          direction?: string
          error_message?: string | null
          external_id?: string | null
          from_email?: string
          from_name?: string | null
          id?: string
          is_read?: boolean | null
          metadata?: Json | null
          project_id?: string | null
          read_at?: string | null
          received_at?: string | null
          sent_at?: string | null
          snoozed_until?: string | null
          status?: string
          subject?: string | null
          ticket_id?: string | null
          to_emails?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      email_project_assignments: {
        Row: {
          created_at: string
          email_id: string
          id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          email_id: string
          id?: string
          project_id: string
        }
        Update: {
          created_at?: string
          email_id?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_project_assignments_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          category: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          subject: string
          updated_at: string
          variables: Json | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          subject: string
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          subject?: string
          updated_at?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      external_resource_files: {
        Row: {
          created_at: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          resource_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          resource_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          resource_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_resource_files_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "external_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_resource_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      external_resource_relations: {
        Row: {
          created_at: string | null
          id: string
          quantity: number | null
          related_resource_id: string
          resource_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          quantity?: number | null
          related_resource_id: string
          resource_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          quantity?: number | null
          related_resource_id?: string
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_resource_relations_related_resource_id_fkey"
            columns: ["related_resource_id"]
            isOneToOne: false
            referencedRelation: "external_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_resource_relations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "external_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      external_resources: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          registration_date: string | null
          resource_type: string | null
          supplier_id: string | null
          unit_cost: number | null
          unit_measure: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          registration_date?: string | null
          resource_type?: string | null
          supplier_id?: string | null
          unit_cost?: number | null
          unit_measure?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          registration_date?: string | null
          resource_type?: string | null
          supplier_id?: string | null
          unit_cost?: number | null
          unit_measure?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_resources_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          activity_id: string | null
          code: number
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          subtotal: number
          unit_price: number
          units: number
          updated_at: string
        }
        Insert: {
          activity_id?: string | null
          code?: number
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          subtotal?: number
          unit_price?: number
          units?: number
          updated_at?: string
        }
        Update: {
          activity_id?: string | null
          code?: number
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          subtotal?: number
          unit_price?: number
          units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "budget_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          accounting_entry_id: string | null
          budget_id: string | null
          created_at: string
          description: string | null
          document_type: string
          id: string
          invoice_date: string
          invoice_number: number
          is_posted: boolean | null
          issuer_account_id: string | null
          observations: string | null
          receiver_account_id: string | null
          subtotal: number
          total: number
          updated_at: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          accounting_entry_id?: string | null
          budget_id?: string | null
          created_at?: string
          description?: string | null
          document_type?: string
          id?: string
          invoice_date?: string
          invoice_number: number
          is_posted?: boolean | null
          issuer_account_id?: string | null
          observations?: string | null
          receiver_account_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          accounting_entry_id?: string | null
          budget_id?: string | null
          created_at?: string
          description?: string | null
          document_type?: string
          id?: string
          invoice_date?: string
          invoice_number?: number
          is_posted?: boolean | null
          issuer_account_id?: string | null
          observations?: string | null
          receiver_account_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_accounting_entry_id_fkey"
            columns: ["accounting_entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_issuer_account_id_fkey"
            columns: ["issuer_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_receiver_account_id_fkey"
            columns: ["receiver_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string
          email_id: string | null
          id: string
          message: string
          metadata: Json | null
          read: boolean
          read_at: string | null
          ticket_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          email_id?: string | null
          id?: string
          message: string
          metadata?: Json | null
          read?: boolean
          read_at?: string | null
          ticket_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          email_id?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          read?: boolean
          read_at?: string | null
          ticket_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuestos: {
        Row: {
          archived: boolean
          codigo_correlativo: number
          comparativa_opciones: string | null
          coordenadas_lat: number | null
          coordenadas_lng: number | null
          created_at: string | null
          end_date: string | null
          id: string
          nombre: string
          poblacion: string
          portada_overlay_opacity: number | null
          portada_text_color: string | null
          portada_text_position: string | null
          portada_url: string | null
          project_id: string | null
          provincia: string | null
          start_date: string | null
          status: string
          updated_at: string | null
          version: string
        }
        Insert: {
          archived?: boolean
          codigo_correlativo: number
          comparativa_opciones?: string | null
          coordenadas_lat?: number | null
          coordenadas_lng?: number | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          nombre: string
          poblacion: string
          portada_overlay_opacity?: number | null
          portada_text_color?: string | null
          portada_text_position?: string | null
          portada_url?: string | null
          project_id?: string | null
          provincia?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string | null
          version: string
        }
        Update: {
          archived?: boolean
          codigo_correlativo?: number
          comparativa_opciones?: string | null
          coordenadas_lat?: number | null
          coordenadas_lng?: number | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          nombre?: string
          poblacion?: string
          portada_overlay_opacity?: number | null
          portada_text_color?: string | null
          portada_text_position?: string | null
          portada_url?: string | null
          project_id?: string | null
          provincia?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "presupuestos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      project_contacts: {
        Row: {
          contact_id: string
          contact_role: string | null
          created_at: string | null
          created_by: string | null
          id: string
          project_id: string
        }
        Insert: {
          contact_id: string
          contact_role?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          project_id: string
        }
        Update: {
          contact_id?: string
          contact_role?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          budget_id: string | null
          contact_id: string | null
          created_at: string | null
          description: string | null
          document_type: string | null
          document_url: string | null
          email_id: string | null
          file_path: string | null
          file_size: number | null
          file_type: string | null
          id: string
          name: string
          project_id: string | null
          tags: string[] | null
          uploaded_by: string | null
          visible_to: string[] | null
        }
        Insert: {
          budget_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          document_type?: string | null
          document_url?: string | null
          email_id?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          name: string
          project_id?: string | null
          tags?: string[] | null
          uploaded_by?: string | null
          visible_to?: string[] | null
        }
        Update: {
          budget_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          document_type?: string | null
          document_url?: string | null
          email_id?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          name?: string
          project_id?: string | null
          tags?: string[] | null
          uploaded_by?: string | null
          visible_to?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_predesigns: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          file_name: string
          file_path: string
          file_type: string | null
          id: string
          project_id: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          file_name: string
          file_path: string
          file_type?: string | null
          id?: string
          project_id: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          file_name?: string
          file_path?: string
          file_type?: string | null
          id?: string
          project_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_predesigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_predesigns_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_profiles: {
        Row: {
          contact_email: string
          contact_name: string
          contact_phone: string | null
          contact_surname: string | null
          created_at: string
          despensa: string | null
          estilo_constructivo: string[] | null
          fecha_ideal_finalizacion: string | null
          forma_geometrica: string | null
          garaje: string | null
          id: string
          lavanderia: string | null
          m2_por_planta: string | null
          mensaje_adicional: string | null
          num_banos_total: string | null
          num_habitaciones_con_bano: string | null
          num_habitaciones_con_vestidor: string | null
          num_habitaciones_total: string | null
          num_plantas: string | null
          patio_descubierto: string | null
          poblacion: string | null
          porche_cubierto: string | null
          presupuesto_global: string | null
          project_id: string | null
          provincia: string | null
          tiene_terreno: string | null
          tipo_cocina: string | null
          tipo_salon: string | null
          tipo_tejado: string | null
          updated_at: string
        }
        Insert: {
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          contact_surname?: string | null
          created_at?: string
          despensa?: string | null
          estilo_constructivo?: string[] | null
          fecha_ideal_finalizacion?: string | null
          forma_geometrica?: string | null
          garaje?: string | null
          id?: string
          lavanderia?: string | null
          m2_por_planta?: string | null
          mensaje_adicional?: string | null
          num_banos_total?: string | null
          num_habitaciones_con_bano?: string | null
          num_habitaciones_con_vestidor?: string | null
          num_habitaciones_total?: string | null
          num_plantas?: string | null
          patio_descubierto?: string | null
          poblacion?: string | null
          porche_cubierto?: string | null
          presupuesto_global?: string | null
          project_id?: string | null
          provincia?: string | null
          tiene_terreno?: string | null
          tipo_cocina?: string | null
          tipo_salon?: string | null
          tipo_tejado?: string | null
          updated_at?: string
        }
        Update: {
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          contact_surname?: string | null
          created_at?: string
          despensa?: string | null
          estilo_constructivo?: string[] | null
          fecha_ideal_finalizacion?: string | null
          forma_geometrica?: string | null
          garaje?: string | null
          id?: string
          lavanderia?: string | null
          m2_por_planta?: string | null
          mensaje_adicional?: string | null
          num_banos_total?: string | null
          num_habitaciones_con_bano?: string | null
          num_habitaciones_con_vestidor?: string | null
          num_habitaciones_total?: string | null
          num_plantas?: string | null
          patio_descubierto?: string | null
          poblacion?: string | null
          porche_cubierto?: string | null
          presupuesto_global?: string | null
          project_id?: string | null
          provincia?: string | null
          tiene_terreno?: string | null
          tipo_cocina?: string | null
          tipo_salon?: string | null
          tipo_tejado?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived: boolean
          budget: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          location: string | null
          name: string
          project_number: number
          project_type: string | null
          source: string | null
          start_date: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          archived?: boolean
          budget?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          name: string
          project_number?: number
          project_type?: string | null
          source?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          archived?: boolean
          budget?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          name?: string
          project_number?: number
          project_type?: string | null
          source?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          assigned_to: string | null
          budget_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          email_id: string | null
          id: string
          project_id: string | null
          reminder_at: string
          reminder_type: string
          status: string
          ticket_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          budget_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          email_id?: string | null
          id?: string
          project_id?: string | null
          reminder_at: string
          reminder_type?: string
          status?: string
          ticket_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          budget_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          email_id?: string | null
          id?: string
          project_id?: string | null
          reminder_at?: string
          reminder_type?: string
          status?: string
          ticket_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      system_alerts: {
        Row: {
          action_url: string | null
          alert_type: string
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          read_at: string | null
          related_id: string | null
          related_type: string | null
          title: string
        }
        Insert: {
          action_url?: string | null
          alert_type: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          read_at?: string | null
          related_id?: string | null
          related_type?: string | null
          title: string
        }
        Update: {
          action_url?: string | null
          alert_type?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          read_at?: string | null
          related_id?: string | null
          related_type?: string | null
          title?: string
        }
        Relationships: []
      }
      tab_visibility_settings: {
        Row: {
          advanced_settings: Json | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          visible_tabs: string[]
        }
        Insert: {
          advanced_settings?: Json | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          visible_tabs?: string[]
        }
        Update: {
          advanced_settings?: Json | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          visible_tabs?: string[]
        }
        Relationships: []
      }
      tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string
          reminder_at: string | null
          resolved_at: string | null
          status: string
          subject: string
          ticket_number: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          reminder_at?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          ticket_number?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          reminder_at?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          ticket_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_access: {
        Row: {
          access_level: string
          activity_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          access_level?: string
          activity_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          access_level?: string
          activity_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_access_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "budget_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_presupuestos: {
        Row: {
          created_at: string | null
          id: string
          presupuesto_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          presupuesto_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          presupuesto_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_presupuestos_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_resource_access: {
        Row: {
          access_level: string
          created_at: string
          id: string
          resource_id: string
          user_id: string
        }
        Insert: {
          access_level?: string
          created_at?: string
          id?: string
          resource_id: string
          user_id: string
        }
        Update: {
          access_level?: string
          created_at?: string
          id?: string
          resource_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_resource_access_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "budget_activity_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          is_from_contact: boolean
          message_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_from_contact?: boolean
          message_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_from_contact?: boolean
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          budget_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          direction: string
          id: string
          message: string
          notes: string | null
          phone_number: string
          project_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          budget_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          message: string
          notes?: string | null
          phone_number: string
          project_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          budget_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          message?: string
          notes?: string | null
          phone_number?: string
          project_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          category: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_exists: { Args: never; Returns: boolean }
      can_access_activity_file: {
        Args: { file_path: string }
        Returns: boolean
      }
      can_access_storage_file: { Args: { file_path: string }; Returns: boolean }
      can_create_notification: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      generate_entry_code: { Args: { entry_year: number }; Returns: string }
      has_presupuesto_access: {
        Args: { _presupuesto_id: string; _user_id: string }
        Returns: boolean
      }
      has_presupuesto_role: {
        Args: {
          _presupuesto_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "administrador" | "colaborador" | "cliente"
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
      app_role: ["administrador", "colaborador", "cliente"],
    },
  },
} as const
