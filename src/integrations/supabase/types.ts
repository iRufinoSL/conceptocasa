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
          has_provisional_account: boolean | null
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
          has_provisional_account?: boolean | null
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
          has_provisional_account?: boolean | null
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
      admin_document_files: {
        Row: {
          created_at: string
          document_id: string
          document_type: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          is_generated_pdf: boolean
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_id: string
          document_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_generated_pdf?: boolean
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string
          document_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_generated_pdf?: boolean
          uploaded_by?: string | null
        }
        Relationships: []
      }
      auth_otp_codes: {
        Row: {
          attempts: number
          code: string
          created_at: string
          expires_at: string
          id: string
          phone_number: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          phone_number: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone_number?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      backup_history: {
        Row: {
          backup_type: string
          created_at: string
          created_by: string | null
          error_message: string | null
          file_path: string | null
          file_size_bytes: number | null
          id: string
          module: string
          status: string
          total_records: number | null
          total_tables: number | null
        }
        Insert: {
          backup_type: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          module?: string
          status?: string
          total_records?: number | null
          total_tables?: number | null
        }
        Update: {
          backup_type?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          module?: string
          status?: string
          total_records?: number | null
          total_tables?: number | null
        }
        Relationships: []
      }
      brain_node_links: {
        Row: {
          created_at: string
          from_node_id: string
          id: string
          link_type: string
          to_node_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_node_id: string
          id?: string
          link_type?: string
          to_node_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_node_id?: string
          id?: string
          link_type?: string
          to_node_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_node_links_from_node_id_fkey"
            columns: ["from_node_id"]
            isOneToOne: false
            referencedRelation: "brain_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_node_links_to_node_id_fkey"
            columns: ["to_node_id"]
            isOneToOne: false
            referencedRelation: "brain_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_nodes: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_pinned: boolean
          name: string
          node_type: string
          order_index: number
          parent_id: string | null
          target_params: Json | null
          target_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_pinned?: boolean
          name: string
          node_type?: string
          order_index?: number
          parent_id?: string | null
          target_params?: Json | null
          target_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_pinned?: boolean
          name?: string
          node_type?: string
          order_index?: number
          parent_id?: string | null
          target_params?: Json | null
          target_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "brain_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_activities: {
        Row: {
          activity_type: string
          actual_end_date: string | null
          actual_start_date: string | null
          budget_id: string
          code: string
          created_at: string
          depends_on_activity_id: string | null
          description: string | null
          duration_days: number | null
          end_date: string | null
          id: string
          is_executed: boolean
          measurement_id: string | null
          measurement_unit: string | null
          name: string
          opciones: string[]
          parent_activity_id: string | null
          phase_id: string | null
          start_date: string | null
          tolerance_days: number | null
          updated_at: string
          uses_measurement: boolean
        }
        Insert: {
          activity_type?: string
          actual_end_date?: string | null
          actual_start_date?: string | null
          budget_id: string
          code: string
          created_at?: string
          depends_on_activity_id?: string | null
          description?: string | null
          duration_days?: number | null
          end_date?: string | null
          id?: string
          is_executed?: boolean
          measurement_id?: string | null
          measurement_unit?: string | null
          name: string
          opciones?: string[]
          parent_activity_id?: string | null
          phase_id?: string | null
          start_date?: string | null
          tolerance_days?: number | null
          updated_at?: string
          uses_measurement?: boolean
        }
        Update: {
          activity_type?: string
          actual_end_date?: string | null
          actual_start_date?: string | null
          budget_id?: string
          code?: string
          created_at?: string
          depends_on_activity_id?: string | null
          description?: string | null
          duration_days?: number | null
          end_date?: string | null
          id?: string
          is_executed?: boolean
          measurement_id?: string | null
          measurement_unit?: string | null
          name?: string
          opciones?: string[]
          parent_activity_id?: string | null
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
            foreignKeyName: "budget_activities_depends_on_activity_id_fkey"
            columns: ["depends_on_activity_id"]
            isOneToOne: false
            referencedRelation: "budget_activities"
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
            foreignKeyName: "budget_activities_parent_activity_id_fkey"
            columns: ["parent_activity_id"]
            isOneToOne: false
            referencedRelation: "budget_activities"
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
      budget_activity_destinations: {
        Row: {
          activity_id: string
          created_at: string
          destination_id: string
          id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          destination_id: string
          id?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          destination_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_activity_destinations_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "budget_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_activity_destinations_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "budget_destinations"
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
          conversion_factor: number | null
          created_at: string | null
          description: string | null
          duration_days: number | null
          end_time: string | null
          external_unit_cost: number | null
          has_travel_time: boolean | null
          id: string
          is_estimation: boolean
          manual_units: number | null
          name: string
          purchase_unit: string | null
          purchase_unit_cost: number | null
          purchase_unit_measure: string | null
          purchase_unit_quantity: number | null
          purchase_units: number | null
          purchase_vat_percent: number | null
          related_units: number | null
          reminder_minutes: number | null
          resource_type: string | null
          safety_margin_percent: number | null
          sales_margin_percent: number | null
          signed_subtotal: number | null
          start_date: string | null
          start_time: string | null
          supplier_id: string | null
          task_status: string | null
          travel_time_minutes: number | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          activity_id?: string | null
          budget_id: string
          conversion_factor?: number | null
          created_at?: string | null
          description?: string | null
          duration_days?: number | null
          end_time?: string | null
          external_unit_cost?: number | null
          has_travel_time?: boolean | null
          id?: string
          is_estimation?: boolean
          manual_units?: number | null
          name: string
          purchase_unit?: string | null
          purchase_unit_cost?: number | null
          purchase_unit_measure?: string | null
          purchase_unit_quantity?: number | null
          purchase_units?: number | null
          purchase_vat_percent?: number | null
          related_units?: number | null
          reminder_minutes?: number | null
          resource_type?: string | null
          safety_margin_percent?: number | null
          sales_margin_percent?: number | null
          signed_subtotal?: number | null
          start_date?: string | null
          start_time?: string | null
          supplier_id?: string | null
          task_status?: string | null
          travel_time_minutes?: number | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_id?: string | null
          budget_id?: string
          conversion_factor?: number | null
          created_at?: string | null
          description?: string | null
          duration_days?: number | null
          end_time?: string | null
          external_unit_cost?: number | null
          has_travel_time?: boolean | null
          id?: string
          is_estimation?: boolean
          manual_units?: number | null
          name?: string
          purchase_unit?: string | null
          purchase_unit_cost?: number | null
          purchase_unit_measure?: string | null
          purchase_unit_quantity?: number | null
          purchase_units?: number | null
          purchase_vat_percent?: number | null
          related_units?: number | null
          reminder_minutes?: number | null
          resource_type?: string | null
          safety_margin_percent?: number | null
          sales_margin_percent?: number | null
          signed_subtotal?: number | null
          start_date?: string | null
          start_time?: string | null
          supplier_id?: string | null
          task_status?: string | null
          travel_time_minutes?: number | null
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
          {
            foreignKeyName: "budget_activity_resources_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
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
      budget_destinations: {
        Row: {
          budget_id: string
          created_at: string
          id: string
          internal_name: string
          order_index: number
          public_name: string
          updated_at: string
        }
        Insert: {
          budget_id: string
          created_at?: string
          id?: string
          internal_name: string
          order_index?: number
          public_name: string
          updated_at?: string
        }
        Update: {
          budget_id?: string
          created_at?: string
          id?: string
          internal_name?: string
          order_index?: number
          public_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_destinations_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_document_links: {
        Row: {
          budget_id: string
          created_at: string
          document_id: string
          id: string
        }
        Insert: {
          budget_id: string
          created_at?: string
          document_id: string
          id?: string
        }
        Update: {
          budget_id?: string
          created_at?: string
          document_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_document_links_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_document_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_floor_plan_block_groups: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string | null
          span_cols: number
          span_rows: number
          start_col: number
          start_row: number
          wall_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          span_cols?: number
          span_rows?: number
          start_col: number
          start_row: number
          wall_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          span_cols?: number
          span_rows?: number
          start_col?: number
          start_row?: number
          wall_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_floor_plan_block_groups_wall_id_fkey"
            columns: ["wall_id"]
            isOneToOne: false
            referencedRelation: "budget_floor_plan_walls"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_floor_plan_openings: {
        Row: {
          created_at: string | null
          height: number
          id: string
          name: string | null
          opening_type: string
          position_x: number | null
          sill_height: number
          wall_id: string
          width: number
        }
        Insert: {
          created_at?: string | null
          height?: number
          id?: string
          name?: string | null
          opening_type?: string
          position_x?: number | null
          sill_height?: number
          wall_id: string
          width?: number
        }
        Update: {
          created_at?: string | null
          height?: number
          id?: string
          name?: string | null
          opening_type?: string
          position_x?: number | null
          sill_height?: number
          wall_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_floor_plan_openings_wall_id_fkey"
            columns: ["wall_id"]
            isOneToOne: false
            referencedRelation: "budget_floor_plan_walls"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_floor_plan_rooms: {
        Row: {
          created_at: string | null
          ext_wall_thickness: number | null
          floor_id: string | null
          floor_plan_id: string
          floor_polygon: Json | null
          group_id: string | null
          group_name: string | null
          has_ceiling: boolean
          has_floor: boolean
          has_roof: boolean
          height: number | null
          id: string
          int_wall_thickness: number | null
          is_base: boolean
          length: number
          name: string
          order_index: number | null
          pos_x: number | null
          pos_y: number | null
          updated_at: string | null
          vertical_section_id: string | null
          width: number
        }
        Insert: {
          created_at?: string | null
          ext_wall_thickness?: number | null
          floor_id?: string | null
          floor_plan_id: string
          floor_polygon?: Json | null
          group_id?: string | null
          group_name?: string | null
          has_ceiling?: boolean
          has_floor?: boolean
          has_roof?: boolean
          height?: number | null
          id?: string
          int_wall_thickness?: number | null
          is_base?: boolean
          length?: number
          name: string
          order_index?: number | null
          pos_x?: number | null
          pos_y?: number | null
          updated_at?: string | null
          vertical_section_id?: string | null
          width?: number
        }
        Update: {
          created_at?: string | null
          ext_wall_thickness?: number | null
          floor_id?: string | null
          floor_plan_id?: string
          floor_polygon?: Json | null
          group_id?: string | null
          group_name?: string | null
          has_ceiling?: boolean
          has_floor?: boolean
          has_roof?: boolean
          height?: number | null
          id?: string
          int_wall_thickness?: number | null
          is_base?: boolean
          length?: number
          name?: string
          order_index?: number | null
          pos_x?: number | null
          pos_y?: number | null
          updated_at?: string | null
          vertical_section_id?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_floor_plan_rooms_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "budget_floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_floor_plan_rooms_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "budget_floor_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_floor_plan_wall_layers: {
        Row: {
          created_at: string | null
          id: string
          is_core: boolean
          layer_order: number
          layer_type: string
          material: string | null
          name: string | null
          thickness_mm: number
          wall_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_core?: boolean
          layer_order?: number
          layer_type?: string
          material?: string | null
          name?: string | null
          thickness_mm?: number
          wall_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_core?: boolean
          layer_order?: number
          layer_type?: string
          material?: string | null
          name?: string | null
          thickness_mm?: number
          wall_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_floor_plan_wall_layers_wall_id_fkey"
            columns: ["wall_id"]
            isOneToOne: false
            referencedRelation: "budget_floor_plan_walls"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_floor_plan_walls: {
        Row: {
          created_at: string | null
          elevation_group: string | null
          height: number | null
          id: string
          room_id: string
          segment_type_overrides: Json | null
          thickness: number | null
          wall_index: number
          wall_type: string
        }
        Insert: {
          created_at?: string | null
          elevation_group?: string | null
          height?: number | null
          id?: string
          room_id: string
          segment_type_overrides?: Json | null
          thickness?: number | null
          wall_index: number
          wall_type?: string
        }
        Update: {
          created_at?: string | null
          elevation_group?: string | null
          height?: number | null
          id?: string
          room_id?: string
          segment_type_overrides?: Json | null
          thickness?: number | null
          wall_index?: number
          wall_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_floor_plan_walls_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "budget_floor_plan_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_floor_plans: {
        Row: {
          block_height_mm: number
          block_length_mm: number
          block_width_mm: number
          budget_id: string
          created_at: string | null
          custom_corners: Json | null
          default_height: number
          eave_excluded_sides: string[] | null
          external_wall_thickness: number
          id: string
          int_block_height_mm: number
          int_block_length_mm: number
          int_block_width_mm: number
          internal_wall_thickness: number
          length: number
          name: string
          ridge_height: number | null
          roof_overhang: number | null
          roof_slope_percent: number | null
          roof_type: string | null
          scale_mode: string
          updated_at: string | null
          width: number
        }
        Insert: {
          block_height_mm?: number
          block_length_mm?: number
          block_width_mm?: number
          budget_id: string
          created_at?: string | null
          custom_corners?: Json | null
          default_height?: number
          eave_excluded_sides?: string[] | null
          external_wall_thickness?: number
          id?: string
          int_block_height_mm?: number
          int_block_length_mm?: number
          int_block_width_mm?: number
          internal_wall_thickness?: number
          length?: number
          name?: string
          ridge_height?: number | null
          roof_overhang?: number | null
          roof_slope_percent?: number | null
          roof_type?: string | null
          scale_mode?: string
          updated_at?: string | null
          width?: number
        }
        Update: {
          block_height_mm?: number
          block_length_mm?: number
          block_width_mm?: number
          budget_id?: string
          created_at?: string | null
          custom_corners?: Json | null
          default_height?: number
          eave_excluded_sides?: string[] | null
          external_wall_thickness?: number
          id?: string
          int_block_height_mm?: number
          int_block_length_mm?: number
          int_block_width_mm?: number
          internal_wall_thickness?: number
          length?: number
          name?: string
          ridge_height?: number | null
          roof_overhang?: number | null
          roof_slope_percent?: number | null
          roof_type?: string | null
          scale_mode?: string
          updated_at?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_floor_plans_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_floors: {
        Row: {
          created_at: string
          floor_plan_id: string
          id: string
          level: string
          name: string
          order_index: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          floor_plan_id: string
          id?: string
          level?: string
          name: string
          order_index?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          floor_plan_id?: string
          id?: string
          level?: string
          name?: string
          order_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_floors_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "budget_floor_plans"
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
          count_raw: number | null
          created_at: string
          description: string | null
          floor: string | null
          id: string
          manual_units: number | null
          measurement_unit: string | null
          name: string
          size_text: string | null
          source: string | null
          source_classification: string | null
          updated_at: string
        }
        Insert: {
          budget_id: string
          count_raw?: number | null
          created_at?: string
          description?: string | null
          floor?: string | null
          id?: string
          manual_units?: number | null
          measurement_unit?: string | null
          name: string
          size_text?: string | null
          source?: string | null
          source_classification?: string | null
          updated_at?: string
        }
        Update: {
          budget_id?: string
          count_raw?: number | null
          created_at?: string
          description?: string | null
          floor?: string | null
          id?: string
          manual_units?: number | null
          measurement_unit?: string | null
          name?: string
          size_text?: string | null
          source?: string | null
          source_classification?: string | null
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
      budget_message_activities: {
        Row: {
          activity_id: string
          comment: string | null
          created_at: string
          id: string
          message_id: string
        }
        Insert: {
          activity_id: string
          comment?: string | null
          created_at?: string
          id?: string
          message_id: string
        }
        Update: {
          activity_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_message_activities_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "budget_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_message_activities_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "budget_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_message_recipients: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          message_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          message_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_message_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_message_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "budget_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_message_resources: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          message_id: string
          resource_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id: string
          resource_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id?: string
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_message_resources_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "budget_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_message_resources_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "budget_activity_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_messages: {
        Row: {
          budget_id: string
          created_at: string
          created_by: string | null
          end_time: string | null
          id: string
          sent_at: string | null
          sent_via: string | null
          start_time: string | null
          status: string
          target_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          budget_id: string
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          sent_at?: string | null
          sent_via?: string | null
          start_time?: string | null
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          budget_id?: string
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          sent_at?: string | null
          sent_via?: string | null
          start_time?: string | null
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_messages_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_object_templates: {
        Row: {
          budget_id: string
          created_at: string
          height_mm: number | null
          id: string
          image_url: string | null
          material_type: string | null
          name: string
          object_type: string
          purchase_price_vat_included: number | null
          safety_margin_percent: number | null
          sales_margin_percent: number | null
          technical_description: string | null
          thickness_mm: number | null
          unit_measure: string | null
          updated_at: string
          vat_included_percent: number | null
          width_mm: number | null
        }
        Insert: {
          budget_id: string
          created_at?: string
          height_mm?: number | null
          id?: string
          image_url?: string | null
          material_type?: string | null
          name: string
          object_type?: string
          purchase_price_vat_included?: number | null
          safety_margin_percent?: number | null
          sales_margin_percent?: number | null
          technical_description?: string | null
          thickness_mm?: number | null
          unit_measure?: string | null
          updated_at?: string
          vat_included_percent?: number | null
          width_mm?: number | null
        }
        Update: {
          budget_id?: string
          created_at?: string
          height_mm?: number | null
          id?: string
          image_url?: string | null
          material_type?: string | null
          name?: string
          object_type?: string
          purchase_price_vat_included?: number | null
          safety_margin_percent?: number | null
          sales_margin_percent?: number | null
          technical_description?: string | null
          thickness_mm?: number | null
          unit_measure?: string | null
          updated_at?: string
          vat_included_percent?: number | null
          width_mm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_object_templates_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_object_type_catalog: {
        Row: {
          budget_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          budget_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          budget_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_object_type_catalog_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_phases: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          budget_id: string
          code: string | null
          created_at: string | null
          depends_on_phase_id: string | null
          duration_days: number | null
          estimated_budget_amount: number | null
          estimated_budget_percent: number | null
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
          actual_end_date?: string | null
          actual_start_date?: string | null
          budget_id: string
          code?: string | null
          created_at?: string | null
          depends_on_phase_id?: string | null
          duration_days?: number | null
          estimated_budget_amount?: number | null
          estimated_budget_percent?: number | null
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
          actual_end_date?: string | null
          actual_start_date?: string | null
          budget_id?: string
          code?: string | null
          created_at?: string | null
          depends_on_phase_id?: string | null
          duration_days?: number | null
          estimated_budget_amount?: number | null
          estimated_budget_percent?: number | null
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
            foreignKeyName: "budget_phases_depends_on_phase_id_fkey"
            columns: ["depends_on_phase_id"]
            isOneToOne: false
            referencedRelation: "budget_phases"
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
          activity_id: string | null
          budget_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_days: number | null
          end_time: string | null
          id: string
          name: string
          resource_id: string | null
          start_date: string | null
          start_time: string | null
          status: string
          target_date: string | null
          updated_at: string
        }
        Insert: {
          activity_id?: string | null
          budget_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_days?: number | null
          end_time?: string | null
          id?: string
          name: string
          resource_id?: string | null
          start_date?: string | null
          start_time?: string | null
          status?: string
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          activity_id?: string | null
          budget_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_days?: number | null
          end_time?: string | null
          id?: string
          name?: string
          resource_id?: string | null
          start_date?: string | null
          start_time?: string | null
          status?: string
          target_date?: string | null
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
          {
            foreignKeyName: "budget_tasks_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_tasks_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "budget_activity_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_volume_layers: {
        Row: {
          created_at: string
          description: string | null
          extra_surface_name: string | null
          floor_id: string | null
          floor_plan_id: string
          group_tag: string | null
          id: string
          include_non_structural: boolean
          layer_order: number
          measurement_type: string
          name: string
          orientation: string | null
          parent_layer_id: string | null
          section_height_mm: number | null
          section_width_mm: number | null
          spacing_mm: number | null
          surface_type: string
          thickness_mm: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          extra_surface_name?: string | null
          floor_id?: string | null
          floor_plan_id: string
          group_tag?: string | null
          id?: string
          include_non_structural?: boolean
          layer_order?: number
          measurement_type?: string
          name?: string
          orientation?: string | null
          parent_layer_id?: string | null
          section_height_mm?: number | null
          section_width_mm?: number | null
          spacing_mm?: number | null
          surface_type: string
          thickness_mm?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          extra_surface_name?: string | null
          floor_id?: string | null
          floor_plan_id?: string
          group_tag?: string | null
          id?: string
          include_non_structural?: boolean
          layer_order?: number
          measurement_type?: string
          name?: string
          orientation?: string | null
          parent_layer_id?: string | null
          section_height_mm?: number | null
          section_width_mm?: number | null
          spacing_mm?: number | null
          surface_type?: string
          thickness_mm?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_volume_layers_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "budget_floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_volume_layers_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "budget_floor_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_volume_layers_parent_layer_id_fkey"
            columns: ["parent_layer_id"]
            isOneToOne: false
            referencedRelation: "budget_volume_layers"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_wall_objects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_core: boolean
          layer_order: number
          length_ml: number | null
          name: string
          object_type: string
          surface_m2: number | null
          template_id: string | null
          thickness_mm: number | null
          updated_at: string
          visual_pattern: string | null
          volume_m3: number | null
          wall_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_core?: boolean
          layer_order?: number
          length_ml?: number | null
          name: string
          object_type?: string
          surface_m2?: number | null
          template_id?: string | null
          thickness_mm?: number | null
          updated_at?: string
          visual_pattern?: string | null
          volume_m3?: number | null
          wall_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_core?: boolean
          layer_order?: number
          length_ml?: number | null
          name?: string
          object_type?: string
          surface_m2?: number | null
          template_id?: string | null
          thickness_mm?: number | null
          updated_at?: string
          visual_pattern?: string | null
          volume_m3?: number | null
          wall_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_wall_objects_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "budget_object_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_wall_objects_wall_id_fkey"
            columns: ["wall_id"]
            isOneToOne: false
            referencedRelation: "budget_floor_plan_walls"
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
          sms_sender_phone: string | null
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
          sms_sender_phone?: string | null
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
          sms_sender_phone?: string | null
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
          first_session_id: string | null
          first_utm_campaign: string | null
          first_utm_medium: string | null
          first_utm_source: string | null
          id: string
          logo_path: string | null
          name: string
          nif_dni: string | null
          observations: string | null
          phone: string | null
          postal_code: string | null
          professional_activity_id: string | null
          province: string | null
          secondary_emails: string[] | null
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
          first_session_id?: string | null
          first_utm_campaign?: string | null
          first_utm_medium?: string | null
          first_utm_source?: string | null
          id?: string
          logo_path?: string | null
          name: string
          nif_dni?: string | null
          observations?: string | null
          phone?: string | null
          postal_code?: string | null
          professional_activity_id?: string | null
          province?: string | null
          secondary_emails?: string[] | null
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
          first_session_id?: string | null
          first_utm_campaign?: string | null
          first_utm_medium?: string | null
          first_utm_source?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          nif_dni?: string | null
          observations?: string | null
          phone?: string | null
          postal_code?: string | null
          professional_activity_id?: string | null
          province?: string | null
          secondary_emails?: string[] | null
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
          project_id: string | null
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
          project_id?: string | null
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
          project_id?: string | null
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
          {
            foreignKeyName: "crm_opportunities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      deletion_backups: {
        Row: {
          backup_data: Json
          budget_id: string
          created_at: string
          created_by: string | null
          entity_id: string
          entity_name: string | null
          entity_type: string
          id: string
          label: string | null
          module: string
          restored_at: string | null
        }
        Insert: {
          backup_data: Json
          budget_id: string
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_name?: string | null
          entity_type: string
          id?: string
          label?: string | null
          module: string
          restored_at?: string | null
        }
        Update: {
          backup_data?: Json
          budget_id?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_name?: string | null
          entity_type?: string
          id?: string
          label?: string | null
          module?: string
          restored_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deletion_backups_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      document_template_outputs: {
        Row: {
          created_at: string
          created_by: string | null
          edited_data: Json
          id: string
          name: string
          output_file_path: string | null
          output_format: string
          template_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          edited_data?: Json
          id?: string
          name: string
          output_file_path?: string | null
          output_format?: string
          template_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          edited_data?: Json
          id?: string
          name?: string
          output_file_path?: string | null
          output_format?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_template_outputs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      document_template_zones: {
        Row: {
          created_at: string
          default_data: Json
          font_family: string
          font_size: number
          id: string
          page_number: number
          table_headers: Json
          template_id: string
          zone_height: number
          zone_width: number
          zone_x: number
          zone_y: number
        }
        Insert: {
          created_at?: string
          default_data?: Json
          font_family?: string
          font_size?: number
          id?: string
          page_number?: number
          table_headers?: Json
          template_id: string
          zone_height: number
          zone_width: number
          zone_x: number
          zone_y: number
        }
        Update: {
          created_at?: string
          default_data?: Json
          font_family?: string
          font_size?: number
          id?: string
          page_number?: number
          table_headers?: Json
          template_id?: string
          zone_height?: number
          zone_width?: number
          zone_x?: number
          zone_y?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_template_zones_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          original_file_path: string
          original_file_type: string | null
          page_count: number
          page_image_paths: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          original_file_path: string
          original_file_type?: string | null
          page_count?: number
          page_image_paths?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          original_file_path?: string
          original_file_type?: string | null
          page_count?: number
          page_image_paths?: Json
          updated_at?: string
        }
        Relationships: []
      }
      document_types: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
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
          delivery_status: string | null
          delivery_updated_at: string | null
          direction: string
          document_type: string | null
          error_message: string | null
          external_id: string | null
          from_email: string
          from_name: string | null
          id: string
          is_document: boolean | null
          is_read: boolean | null
          metadata: Json | null
          project_id: string | null
          read_at: string | null
          read_receipt_at: string | null
          receipt_reminder_sent: boolean
          receipt_reminder_sent_at: string | null
          received_at: string | null
          reminder_sent_at: string | null
          request_read_receipt: boolean
          response_deadline: string | null
          response_received: boolean | null
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
          delivery_status?: string | null
          delivery_updated_at?: string | null
          direction: string
          document_type?: string | null
          error_message?: string | null
          external_id?: string | null
          from_email: string
          from_name?: string | null
          id?: string
          is_document?: boolean | null
          is_read?: boolean | null
          metadata?: Json | null
          project_id?: string | null
          read_at?: string | null
          read_receipt_at?: string | null
          receipt_reminder_sent?: boolean
          receipt_reminder_sent_at?: string | null
          received_at?: string | null
          reminder_sent_at?: string | null
          request_read_receipt?: boolean
          response_deadline?: string | null
          response_received?: boolean | null
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
          delivery_status?: string | null
          delivery_updated_at?: string | null
          direction?: string
          document_type?: string | null
          error_message?: string | null
          external_id?: string | null
          from_email?: string
          from_name?: string | null
          id?: string
          is_document?: boolean | null
          is_read?: boolean | null
          metadata?: Json | null
          project_id?: string | null
          read_at?: string | null
          read_receipt_at?: string | null
          receipt_reminder_sent?: boolean
          receipt_reminder_sent_at?: string | null
          received_at?: string | null
          reminder_sent_at?: string | null
          request_read_receipt?: boolean
          response_deadline?: string | null
          response_received?: boolean | null
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
          trade_id: string | null
          unit_cost: number | null
          unit_measure: string | null
          updated_at: string | null
          vat_included_percent: number | null
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
          trade_id?: string | null
          unit_cost?: number | null
          unit_measure?: string | null
          updated_at?: string | null
          vat_included_percent?: number | null
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
          trade_id?: string | null
          unit_cost?: number | null
          unit_measure?: string | null
          updated_at?: string | null
          vat_included_percent?: number | null
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
          {
            foreignKeyName: "external_resources_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "resource_trades"
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
          footer_contact_source: string
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
          footer_contact_source?: string
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
          footer_contact_source?: string
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
      model_users: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          role_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          role_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          role_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      module_snapshots: {
        Row: {
          budget_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          module: string
          snapshot_data: Json
          snapshot_type: string
        }
        Insert: {
          budget_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          module: string
          snapshot_data?: Json
          snapshot_type: string
        }
        Update: {
          budget_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          module?: string
          snapshot_data?: Json
          snapshot_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_snapshots_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
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
      preliminary_urban_reports: {
        Row: {
          analysis_result: Json | null
          budget_id: string
          content_text: string | null
          created_at: string
          description: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          file_type: string | null
          id: string
          is_analyzed: boolean | null
          report_date: string | null
          report_type: string
          source: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          analysis_result?: Json | null
          budget_id: string
          content_text?: string | null
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_analyzed?: boolean | null
          report_date?: string | null
          report_type?: string
          source?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          analysis_result?: Json | null
          budget_id?: string
          content_text?: string | null
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_analyzed?: boolean | null
          report_date?: string | null
          report_type?: string
          source?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preliminary_urban_reports_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
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
          default_external_wall_thickness: number | null
          default_internal_wall_thickness: number | null
          default_room_height: number | null
          direccion: string | null
          end_date: string | null
          estimated_budget: number | null
          estimated_surface_m2: number | null
          google_maps_url: string | null
          id: string
          is_signed: boolean
          nombre: string
          option_a_description: string | null
          option_b_description: string | null
          option_c_description: string | null
          poblacion: string
          portada_overlay_opacity: number | null
          portada_text_color: string | null
          portada_text_position: string | null
          portada_url: string | null
          project_id: string | null
          provincia: string | null
          signed_at: string | null
          start_date: string | null
          status: string
          terreno_length: number | null
          terreno_m2: number | null
          terreno_width: number | null
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
          default_external_wall_thickness?: number | null
          default_internal_wall_thickness?: number | null
          default_room_height?: number | null
          direccion?: string | null
          end_date?: string | null
          estimated_budget?: number | null
          estimated_surface_m2?: number | null
          google_maps_url?: string | null
          id?: string
          is_signed?: boolean
          nombre: string
          option_a_description?: string | null
          option_b_description?: string | null
          option_c_description?: string | null
          poblacion: string
          portada_overlay_opacity?: number | null
          portada_text_color?: string | null
          portada_text_position?: string | null
          portada_url?: string | null
          project_id?: string | null
          provincia?: string | null
          signed_at?: string | null
          start_date?: string | null
          status?: string
          terreno_length?: number | null
          terreno_m2?: number | null
          terreno_width?: number | null
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
          default_external_wall_thickness?: number | null
          default_internal_wall_thickness?: number | null
          default_room_height?: number | null
          direccion?: string | null
          end_date?: string | null
          estimated_budget?: number | null
          estimated_surface_m2?: number | null
          google_maps_url?: string | null
          id?: string
          is_signed?: boolean
          nombre?: string
          option_a_description?: string | null
          option_b_description?: string | null
          option_c_description?: string | null
          poblacion?: string
          portada_overlay_opacity?: number | null
          portada_text_color?: string | null
          portada_text_position?: string | null
          portada_url?: string | null
          project_id?: string | null
          provincia?: string | null
          signed_at?: string | null
          start_date?: string | null
          status?: string
          terreno_length?: number | null
          terreno_m2?: number | null
          terreno_width?: number | null
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
          hourly_rate: number | null
          id: string
          last_route: string | null
          notification_email: string | null
          notification_phone: string | null
          notification_type: string | null
          password_change_required: boolean | null
          personal_notification_email: string | null
          personal_notification_phone: string | null
          personal_notification_type: string | null
          system_notification_email: string | null
          system_notification_phone: string | null
          system_notification_type: string | null
          two_factor_enabled: boolean | null
          two_factor_phone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          hourly_rate?: number | null
          id: string
          last_route?: string | null
          notification_email?: string | null
          notification_phone?: string | null
          notification_type?: string | null
          password_change_required?: boolean | null
          personal_notification_email?: string | null
          personal_notification_phone?: string | null
          personal_notification_type?: string | null
          system_notification_email?: string | null
          system_notification_phone?: string | null
          system_notification_type?: string | null
          two_factor_enabled?: boolean | null
          two_factor_phone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          hourly_rate?: number | null
          id?: string
          last_route?: string | null
          notification_email?: string | null
          notification_phone?: string | null
          notification_type?: string | null
          password_change_required?: boolean | null
          personal_notification_email?: string | null
          personal_notification_phone?: string | null
          personal_notification_type?: string | null
          system_notification_email?: string | null
          system_notification_phone?: string | null
          system_notification_type?: string | null
          two_factor_enabled?: boolean | null
          two_factor_phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      project_assignments: {
        Row: {
          created_at: string
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          document_types: string[] | null
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
          document_types?: string[] | null
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
          document_types?: string[] | null
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
          altura_habitaciones: number | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          contact_surname: string | null
          coordenadas_google_maps: string | null
          created_at: string
          despensa: string | null
          espacios_detalle: Json | null
          espesor_paredes_externas: number | null
          espesor_paredes_internas: number | null
          estilo_constructivo: string[] | null
          fecha_ideal_finalizacion: string | null
          forma_geometrica: string | null
          garaje: string | null
          google_maps_url: string | null
          id: string
          inclinacion_terreno: string | null
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
          altura_habitaciones?: number | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          contact_surname?: string | null
          coordenadas_google_maps?: string | null
          created_at?: string
          despensa?: string | null
          espacios_detalle?: Json | null
          espesor_paredes_externas?: number | null
          espesor_paredes_internas?: number | null
          estilo_constructivo?: string[] | null
          fecha_ideal_finalizacion?: string | null
          forma_geometrica?: string | null
          garaje?: string | null
          google_maps_url?: string | null
          id?: string
          inclinacion_terreno?: string | null
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
          altura_habitaciones?: number | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          contact_surname?: string | null
          coordenadas_google_maps?: string | null
          created_at?: string
          despensa?: string | null
          espacios_detalle?: Json | null
          espesor_paredes_externas?: number | null
          espesor_paredes_internas?: number | null
          estilo_constructivo?: string[] | null
          fecha_ideal_finalizacion?: string | null
          forma_geometrica?: string | null
          garaje?: string | null
          google_maps_url?: string | null
          id?: string
          inclinacion_terreno?: string | null
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
          housing_profile: Json | null
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
          housing_profile?: Json | null
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
          housing_profile?: Json | null
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
      purchase_order_lines: {
        Row: {
          activity_id: string | null
          code: number
          created_at: string
          description: string | null
          id: string
          purchase_order_id: string
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
          purchase_order_id: string
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
          purchase_order_id?: string
          subtotal?: number
          unit_price?: number
          units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "budget_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          budget_id: string | null
          client_contact_id: string | null
          created_at: string
          description: string | null
          footer_contact_source: string
          id: string
          observations: string | null
          order_date: string
          order_id: string | null
          order_number: number
          subtotal: number
          supplier_contact_id: string | null
          total: number
          updated_at: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          budget_id?: string | null
          client_contact_id?: string | null
          created_at?: string
          description?: string | null
          footer_contact_source?: string
          id?: string
          observations?: string | null
          order_date?: string
          order_id?: string | null
          order_number: number
          subtotal?: number
          supplier_contact_id?: string | null
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          budget_id?: string | null
          client_contact_id?: string | null
          created_at?: string
          description?: string | null
          footer_contact_source?: string
          id?: string
          observations?: string | null
          order_date?: string
          order_id?: string | null
          order_number?: number
          subtotal?: number
          supplier_contact_id?: string | null
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_client_contact_id_fkey"
            columns: ["client_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_contact_id_fkey"
            columns: ["supplier_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
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
      resource_trades: {
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
      tolosa_item_measurements: {
        Row: {
          created_at: string
          id: string
          measurement_id: string
          tolosa_item_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          measurement_id: string
          tolosa_item_id: string
        }
        Update: {
          created_at?: string
          id?: string
          measurement_id?: string
          tolosa_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tolosa_item_measurements_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "budget_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tolosa_item_measurements_tolosa_item_id_fkey"
            columns: ["tolosa_item_id"]
            isOneToOne: false
            referencedRelation: "tolosa_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tolosa_item_resources: {
        Row: {
          created_at: string
          id: string
          resource_id: string
          tolosa_item_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          resource_id: string
          tolosa_item_id: string
        }
        Update: {
          created_at?: string
          id?: string
          resource_id?: string
          tolosa_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tolosa_item_resources_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "budget_activity_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tolosa_item_resources_tolosa_item_id_fkey"
            columns: ["tolosa_item_id"]
            isOneToOne: false
            referencedRelation: "tolosa_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tolosa_items: {
        Row: {
          address_city: string | null
          address_postal_code: string | null
          address_province: string | null
          address_street: string | null
          budget_id: string
          cadastral_reference: string | null
          client_contact_id: string | null
          code: string
          created_at: string
          description: string | null
          google_maps_url: string | null
          housing_profile_id: string | null
          id: string
          is_executed: boolean
          latitude: number | null
          longitude: number | null
          name: string
          order_index: number
          parent_id: string | null
          phase_id: string | null
          supplier_contact_id: string | null
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_postal_code?: string | null
          address_province?: string | null
          address_street?: string | null
          budget_id: string
          cadastral_reference?: string | null
          client_contact_id?: string | null
          code: string
          created_at?: string
          description?: string | null
          google_maps_url?: string | null
          housing_profile_id?: string | null
          id?: string
          is_executed?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          order_index?: number
          parent_id?: string | null
          phase_id?: string | null
          supplier_contact_id?: string | null
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_postal_code?: string | null
          address_province?: string | null
          address_street?: string | null
          budget_id?: string
          cadastral_reference?: string | null
          client_contact_id?: string | null
          code?: string
          created_at?: string
          description?: string | null
          google_maps_url?: string | null
          housing_profile_id?: string | null
          id?: string
          is_executed?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          order_index?: number
          parent_id?: string | null
          phase_id?: string | null
          supplier_contact_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tolosa_items_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tolosa_items_client_contact_id_fkey"
            columns: ["client_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tolosa_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tolosa_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tolosa_items_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "budget_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tolosa_items_supplier_contact_id_fkey"
            columns: ["supplier_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      urban_document_uploads: {
        Row: {
          budget_id: string | null
          created_at: string
          created_by: string | null
          document_type: string | null
          error_message: string | null
          external_url: string | null
          extracted_data: Json | null
          extracted_text: string | null
          file_size_bytes: number | null
          id: string
          municipality: string | null
          original_filename: string | null
          pages_processed: number | null
          processing_completed_at: string | null
          processing_started_at: string | null
          province: string | null
          source_type: string
          status: string
          storage_path: string | null
          total_pages: number | null
          updated_at: string
          urban_profile_id: string | null
        }
        Insert: {
          budget_id?: string | null
          created_at?: string
          created_by?: string | null
          document_type?: string | null
          error_message?: string | null
          external_url?: string | null
          extracted_data?: Json | null
          extracted_text?: string | null
          file_size_bytes?: number | null
          id?: string
          municipality?: string | null
          original_filename?: string | null
          pages_processed?: number | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          province?: string | null
          source_type: string
          status?: string
          storage_path?: string | null
          total_pages?: number | null
          updated_at?: string
          urban_profile_id?: string | null
        }
        Update: {
          budget_id?: string | null
          created_at?: string
          created_by?: string | null
          document_type?: string | null
          error_message?: string | null
          external_url?: string | null
          extracted_data?: Json | null
          extracted_text?: string | null
          file_size_bytes?: number | null
          id?: string
          municipality?: string | null
          original_filename?: string | null
          pages_processed?: number | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          province?: string | null
          source_type?: string
          status?: string
          storage_path?: string | null
          total_pages?: number | null
          updated_at?: string
          urban_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "urban_document_uploads_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "urban_document_uploads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "urban_document_uploads_urban_profile_id_fkey"
            columns: ["urban_profile_id"]
            isOneToOne: false
            referencedRelation: "urban_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      urban_profile_regulations: {
        Row: {
          created_at: string
          extracted_data: Json | null
          extraction_date: string | null
          id: string
          notes: string | null
          profile_id: string
          regulation_id: string
        }
        Insert: {
          created_at?: string
          extracted_data?: Json | null
          extraction_date?: string | null
          id?: string
          notes?: string | null
          profile_id: string
          regulation_id: string
        }
        Update: {
          created_at?: string
          extracted_data?: Json | null
          extraction_date?: string | null
          id?: string
          notes?: string | null
          profile_id?: string
          regulation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "urban_profile_regulations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "urban_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "urban_profile_regulations_regulation_id_fkey"
            columns: ["regulation_id"]
            isOneToOne: false
            referencedRelation: "urban_regulations"
            referencedColumns: ["id"]
          },
        ]
      }
      urban_profiles: {
        Row: {
          access_width: number | null
          access_width_source: string | null
          additional_restrictions: Json | null
          address: string | null
          affected_by_airport: boolean | null
          affected_by_cemetery: boolean | null
          affected_by_coast: boolean | null
          affected_by_forest: boolean | null
          affected_by_heritage: boolean | null
          affected_by_livestock_route: boolean | null
          affected_by_power_lines: boolean | null
          affected_by_water_courses: boolean | null
          analysis_notes: string | null
          analysis_status: string | null
          authorizing_body: string | null
          authorizing_body_name: string | null
          autonomous_community: string | null
          budget_id: string
          buildability_assessment: string | null
          buildability_index: number | null
          buildability_index_source: string | null
          buildability_requirements: Json | null
          building_typology: string | null
          building_typology_source: string | null
          cadastral_reference: string
          cadastral_value: number | null
          climatic_zone: string | null
          compatible_uses: Json | null
          construction_year: number | null
          consulted_sources: Json | null
          coordinates_source: string | null
          created_at: string
          created_by: string | null
          distance_to_electricity: number | null
          distance_to_electricity_source: string | null
          distance_to_sewage_network: number | null
          distance_to_sewage_network_source: string | null
          distance_to_urban_nucleus: number | null
          distance_to_urban_nucleus_source: string | null
          distance_to_water_supply: number | null
          distance_to_water_supply_source: string | null
          fence_setback: number | null
          fence_setback_source: string | null
          front_setback: number | null
          front_setback_source: string | null
          google_maps_lat: number | null
          google_maps_lng: number | null
          has_municipal_sewage: boolean | null
          has_municipal_sewage_source: string | null
          highway_setback: number | null
          highway_setback_source: string | null
          id: string
          implantation_conditions: string | null
          implantation_conditions_source: string | null
          is_buildable: boolean | null
          is_buildable_source: string | null
          is_divisible: boolean | null
          is_divisible_source: string | null
          land_class: string | null
          land_use: string | null
          last_analyzed_at: string | null
          locality: string | null
          max_buildable_volume: number | null
          max_buildable_volume_source: string | null
          max_built_surface: number | null
          max_built_surface_source: string | null
          max_floors: number | null
          max_floors_source: string | null
          max_height: number | null
          max_height_airport: number | null
          max_height_airport_source: string | null
          max_height_source: string | null
          max_occupation_percent: number | null
          max_occupation_source: string | null
          min_distance_airport: number | null
          min_distance_airport_source: string | null
          min_distance_cemetery: number | null
          min_distance_cemetery_source: string | null
          min_distance_coast: number | null
          min_distance_coast_source: string | null
          min_distance_forest: number | null
          min_distance_forest_source: string | null
          min_distance_neighbors: number | null
          min_distance_neighbors_source: string | null
          min_distance_pipeline: number | null
          min_distance_pipeline_source: string | null
          min_distance_power_lines: number | null
          min_distance_power_lines_source: string | null
          min_distance_railway: number | null
          min_distance_railway_source: string | null
          min_distance_roads: number | null
          min_distance_roads_source: string | null
          min_distance_slopes: number | null
          min_distance_slopes_source: string | null
          min_distance_water_courses: number | null
          min_distance_water_courses_source: string | null
          min_plot_area: number | null
          municipal_road_setback: number | null
          municipal_road_setback_source: string | null
          municipality: string | null
          nearest_urban_nucleus: string | null
          permitted_uses: Json | null
          principal_use: string | null
          principal_use_source: string | null
          prohibited_uses: Json | null
          province: string | null
          rear_setback: number | null
          rear_setback_source: string | null
          requires_septic_tank: boolean | null
          road_setback: number | null
          road_setback_source: string | null
          rustic_land_use: string | null
          rustic_land_use_source: string | null
          sectoral_restrictions: Json | null
          seismic_zone: string | null
          septic_tank_min_distance: number | null
          septic_tank_min_distance_source: string | null
          septic_tank_regulations: string | null
          side_setback: number | null
          side_setback_source: string | null
          snow_zone: string | null
          soil_category: string | null
          soil_category_source: string | null
          surface_area: number | null
          updated_at: string
          urban_classification: string | null
          urban_qualification: string | null
          wind_zone: string | null
        }
        Insert: {
          access_width?: number | null
          access_width_source?: string | null
          additional_restrictions?: Json | null
          address?: string | null
          affected_by_airport?: boolean | null
          affected_by_cemetery?: boolean | null
          affected_by_coast?: boolean | null
          affected_by_forest?: boolean | null
          affected_by_heritage?: boolean | null
          affected_by_livestock_route?: boolean | null
          affected_by_power_lines?: boolean | null
          affected_by_water_courses?: boolean | null
          analysis_notes?: string | null
          analysis_status?: string | null
          authorizing_body?: string | null
          authorizing_body_name?: string | null
          autonomous_community?: string | null
          budget_id: string
          buildability_assessment?: string | null
          buildability_index?: number | null
          buildability_index_source?: string | null
          buildability_requirements?: Json | null
          building_typology?: string | null
          building_typology_source?: string | null
          cadastral_reference: string
          cadastral_value?: number | null
          climatic_zone?: string | null
          compatible_uses?: Json | null
          construction_year?: number | null
          consulted_sources?: Json | null
          coordinates_source?: string | null
          created_at?: string
          created_by?: string | null
          distance_to_electricity?: number | null
          distance_to_electricity_source?: string | null
          distance_to_sewage_network?: number | null
          distance_to_sewage_network_source?: string | null
          distance_to_urban_nucleus?: number | null
          distance_to_urban_nucleus_source?: string | null
          distance_to_water_supply?: number | null
          distance_to_water_supply_source?: string | null
          fence_setback?: number | null
          fence_setback_source?: string | null
          front_setback?: number | null
          front_setback_source?: string | null
          google_maps_lat?: number | null
          google_maps_lng?: number | null
          has_municipal_sewage?: boolean | null
          has_municipal_sewage_source?: string | null
          highway_setback?: number | null
          highway_setback_source?: string | null
          id?: string
          implantation_conditions?: string | null
          implantation_conditions_source?: string | null
          is_buildable?: boolean | null
          is_buildable_source?: string | null
          is_divisible?: boolean | null
          is_divisible_source?: string | null
          land_class?: string | null
          land_use?: string | null
          last_analyzed_at?: string | null
          locality?: string | null
          max_buildable_volume?: number | null
          max_buildable_volume_source?: string | null
          max_built_surface?: number | null
          max_built_surface_source?: string | null
          max_floors?: number | null
          max_floors_source?: string | null
          max_height?: number | null
          max_height_airport?: number | null
          max_height_airport_source?: string | null
          max_height_source?: string | null
          max_occupation_percent?: number | null
          max_occupation_source?: string | null
          min_distance_airport?: number | null
          min_distance_airport_source?: string | null
          min_distance_cemetery?: number | null
          min_distance_cemetery_source?: string | null
          min_distance_coast?: number | null
          min_distance_coast_source?: string | null
          min_distance_forest?: number | null
          min_distance_forest_source?: string | null
          min_distance_neighbors?: number | null
          min_distance_neighbors_source?: string | null
          min_distance_pipeline?: number | null
          min_distance_pipeline_source?: string | null
          min_distance_power_lines?: number | null
          min_distance_power_lines_source?: string | null
          min_distance_railway?: number | null
          min_distance_railway_source?: string | null
          min_distance_roads?: number | null
          min_distance_roads_source?: string | null
          min_distance_slopes?: number | null
          min_distance_slopes_source?: string | null
          min_distance_water_courses?: number | null
          min_distance_water_courses_source?: string | null
          min_plot_area?: number | null
          municipal_road_setback?: number | null
          municipal_road_setback_source?: string | null
          municipality?: string | null
          nearest_urban_nucleus?: string | null
          permitted_uses?: Json | null
          principal_use?: string | null
          principal_use_source?: string | null
          prohibited_uses?: Json | null
          province?: string | null
          rear_setback?: number | null
          rear_setback_source?: string | null
          requires_septic_tank?: boolean | null
          road_setback?: number | null
          road_setback_source?: string | null
          rustic_land_use?: string | null
          rustic_land_use_source?: string | null
          sectoral_restrictions?: Json | null
          seismic_zone?: string | null
          septic_tank_min_distance?: number | null
          septic_tank_min_distance_source?: string | null
          septic_tank_regulations?: string | null
          side_setback?: number | null
          side_setback_source?: string | null
          snow_zone?: string | null
          soil_category?: string | null
          soil_category_source?: string | null
          surface_area?: number | null
          updated_at?: string
          urban_classification?: string | null
          urban_qualification?: string | null
          wind_zone?: string | null
        }
        Update: {
          access_width?: number | null
          access_width_source?: string | null
          additional_restrictions?: Json | null
          address?: string | null
          affected_by_airport?: boolean | null
          affected_by_cemetery?: boolean | null
          affected_by_coast?: boolean | null
          affected_by_forest?: boolean | null
          affected_by_heritage?: boolean | null
          affected_by_livestock_route?: boolean | null
          affected_by_power_lines?: boolean | null
          affected_by_water_courses?: boolean | null
          analysis_notes?: string | null
          analysis_status?: string | null
          authorizing_body?: string | null
          authorizing_body_name?: string | null
          autonomous_community?: string | null
          budget_id?: string
          buildability_assessment?: string | null
          buildability_index?: number | null
          buildability_index_source?: string | null
          buildability_requirements?: Json | null
          building_typology?: string | null
          building_typology_source?: string | null
          cadastral_reference?: string
          cadastral_value?: number | null
          climatic_zone?: string | null
          compatible_uses?: Json | null
          construction_year?: number | null
          consulted_sources?: Json | null
          coordinates_source?: string | null
          created_at?: string
          created_by?: string | null
          distance_to_electricity?: number | null
          distance_to_electricity_source?: string | null
          distance_to_sewage_network?: number | null
          distance_to_sewage_network_source?: string | null
          distance_to_urban_nucleus?: number | null
          distance_to_urban_nucleus_source?: string | null
          distance_to_water_supply?: number | null
          distance_to_water_supply_source?: string | null
          fence_setback?: number | null
          fence_setback_source?: string | null
          front_setback?: number | null
          front_setback_source?: string | null
          google_maps_lat?: number | null
          google_maps_lng?: number | null
          has_municipal_sewage?: boolean | null
          has_municipal_sewage_source?: string | null
          highway_setback?: number | null
          highway_setback_source?: string | null
          id?: string
          implantation_conditions?: string | null
          implantation_conditions_source?: string | null
          is_buildable?: boolean | null
          is_buildable_source?: string | null
          is_divisible?: boolean | null
          is_divisible_source?: string | null
          land_class?: string | null
          land_use?: string | null
          last_analyzed_at?: string | null
          locality?: string | null
          max_buildable_volume?: number | null
          max_buildable_volume_source?: string | null
          max_built_surface?: number | null
          max_built_surface_source?: string | null
          max_floors?: number | null
          max_floors_source?: string | null
          max_height?: number | null
          max_height_airport?: number | null
          max_height_airport_source?: string | null
          max_height_source?: string | null
          max_occupation_percent?: number | null
          max_occupation_source?: string | null
          min_distance_airport?: number | null
          min_distance_airport_source?: string | null
          min_distance_cemetery?: number | null
          min_distance_cemetery_source?: string | null
          min_distance_coast?: number | null
          min_distance_coast_source?: string | null
          min_distance_forest?: number | null
          min_distance_forest_source?: string | null
          min_distance_neighbors?: number | null
          min_distance_neighbors_source?: string | null
          min_distance_pipeline?: number | null
          min_distance_pipeline_source?: string | null
          min_distance_power_lines?: number | null
          min_distance_power_lines_source?: string | null
          min_distance_railway?: number | null
          min_distance_railway_source?: string | null
          min_distance_roads?: number | null
          min_distance_roads_source?: string | null
          min_distance_slopes?: number | null
          min_distance_slopes_source?: string | null
          min_distance_water_courses?: number | null
          min_distance_water_courses_source?: string | null
          min_plot_area?: number | null
          municipal_road_setback?: number | null
          municipal_road_setback_source?: string | null
          municipality?: string | null
          nearest_urban_nucleus?: string | null
          permitted_uses?: Json | null
          principal_use?: string | null
          principal_use_source?: string | null
          prohibited_uses?: Json | null
          province?: string | null
          rear_setback?: number | null
          rear_setback_source?: string | null
          requires_septic_tank?: boolean | null
          road_setback?: number | null
          road_setback_source?: string | null
          rustic_land_use?: string | null
          rustic_land_use_source?: string | null
          sectoral_restrictions?: Json | null
          seismic_zone?: string | null
          septic_tank_min_distance?: number | null
          septic_tank_min_distance_source?: string | null
          septic_tank_regulations?: string | null
          side_setback?: number | null
          side_setback_source?: string | null
          snow_zone?: string | null
          soil_category?: string | null
          soil_category_source?: string | null
          surface_area?: number | null
          updated_at?: string
          urban_classification?: string | null
          urban_qualification?: string | null
          wind_zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "urban_profiles_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "urban_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      urban_regulations: {
        Row: {
          created_at: string
          document_path: string | null
          document_url: string | null
          effective_date: string | null
          id: string
          is_active: boolean | null
          issuing_authority: string | null
          name: string
          publication_date: string | null
          regulation_type: string
          scope_autonomous_community: string | null
          scope_municipality: string | null
          scope_province: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_path?: string | null
          document_url?: string | null
          effective_date?: string | null
          id?: string
          is_active?: boolean | null
          issuing_authority?: string | null
          name: string
          publication_date?: string | null
          regulation_type: string
          scope_autonomous_community?: string | null
          scope_municipality?: string | null
          scope_province?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_path?: string | null
          document_url?: string | null
          effective_date?: string | null
          id?: string
          is_active?: boolean | null
          issuing_authority?: string | null
          name?: string
          publication_date?: string | null
          regulation_type?: string
          scope_autonomous_community?: string | null
          scope_municipality?: string | null
          scope_province?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
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
      user_app_access: {
        Row: {
          app_name: string
          can_access: boolean
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_name: string
          can_access?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_name?: string
          can_access?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_field_access: {
        Row: {
          can_edit: boolean
          can_view: boolean
          created_at: string
          field_name: string
          id: string
          table_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          field_name: string
          id?: string
          table_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          field_name?: string
          id?: string
          table_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      user_tab_access: {
        Row: {
          app_name: string
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          tab_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_name: string
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          tab_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_name?: string
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          tab_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      voice_notes: {
        Row: {
          budget_id: string | null
          budget_name: string | null
          contact_id: string | null
          contact_name: string | null
          created_at: string
          created_by: string
          id: string
          message: string
          reminder_at: string | null
          sms_sent: boolean
          sms_sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          budget_id?: string | null
          budget_name?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          created_by: string
          id?: string
          message: string
          reminder_at?: string | null
          sms_sent?: boolean
          sms_sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          budget_id?: string | null
          budget_name?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string
          id?: string
          message?: string
          reminder_at?: string | null
          sms_sent?: boolean
          sms_sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_notes_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      website_events: {
        Row: {
          contact_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          page_path: string | null
          page_title: string | null
          referrer: string | null
          screen_height: number | null
          screen_width: number | null
          session_id: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          page_title?: string | null
          referrer?: string | null
          screen_height?: number | null
          screen_width?: number | null
          session_id: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          page_title?: string | null
          referrer?: string | null
          screen_height?: number | null
          screen_width?: number | null
          session_id?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
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
      whatsapp_budget_assignments: {
        Row: {
          budget_id: string
          created_at: string
          id: string
          message_id: string
        }
        Insert: {
          budget_id: string
          created_at?: string
          id?: string
          message_id: string
        }
        Update: {
          budget_id?: string
          created_at?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_budget_assignments_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_budget_assignments_message_id_fkey"
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
      whatsapp_project_assignments: {
        Row: {
          created_at: string
          id: string
          message_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_project_assignments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_project_assignments_project_id_fkey"
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
      work_report_entries: {
        Row: {
          activity_id: string | null
          created_at: string | null
          description: string
          id: string
          work_report_id: string
        }
        Insert: {
          activity_id?: string | null
          created_at?: string | null
          description: string
          id?: string
          work_report_id: string
        }
        Update: {
          activity_id?: string | null
          created_at?: string | null
          description?: string
          id?: string
          work_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_report_entries_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "budget_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_report_entries_work_report_id_fkey"
            columns: ["work_report_id"]
            isOneToOne: false
            referencedRelation: "work_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      work_report_entry_images: {
        Row: {
          created_at: string | null
          entry_id: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          entry_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          entry_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_report_entry_images_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "work_report_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_report_entry_images_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_report_workers: {
        Row: {
          created_at: string | null
          hourly_rate_override: number | null
          hours_worked: number | null
          id: string
          notes: string | null
          profile_id: string
          work_report_id: string
        }
        Insert: {
          created_at?: string | null
          hourly_rate_override?: number | null
          hours_worked?: number | null
          id?: string
          notes?: string | null
          profile_id: string
          work_report_id: string
        }
        Update: {
          created_at?: string | null
          hourly_rate_override?: number | null
          hours_worked?: number | null
          id?: string
          notes?: string | null
          profile_id?: string
          work_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_report_workers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_report_workers_work_report_id_fkey"
            columns: ["work_report_id"]
            isOneToOne: false
            referencedRelation: "work_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      work_reports: {
        Row: {
          budget_id: string
          created_at: string | null
          created_by: string | null
          id: string
          report_date: string
          title: string
          updated_at: string | null
        }
        Insert: {
          budget_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          report_date?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          budget_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          report_date?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_reports_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_monthly_summary: {
        Row: {
          budget_id: string
          created_at: string | null
          id: string
          profile_id: string
          total_cost: number | null
          total_hours: number | null
          updated_at: string | null
          work_days: number | null
          year_month: string
        }
        Insert: {
          budget_id: string
          created_at?: string | null
          id?: string
          profile_id: string
          total_cost?: number | null
          total_hours?: number | null
          updated_at?: string | null
          work_days?: number | null
          year_month: string
        }
        Update: {
          budget_id?: string
          created_at?: string | null
          id?: string
          profile_id?: string
          total_cost?: number | null
          total_hours?: number | null
          updated_at?: string | null
          work_days?: number | null
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_monthly_summary_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_monthly_summary_profile_id_fkey"
            columns: ["profile_id"]
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
      cleanup_expired_otp_codes: { Args: never; Returns: undefined }
      generate_entry_code: { Args: { entry_year: number }; Returns: string }
      has_app_access: {
        Args: { _app_name: string; _user_id: string }
        Returns: boolean
      }
      has_field_access: {
        Args: {
          _access_type?: string
          _field_name: string
          _table_name: string
          _user_id: string
        }
        Returns: boolean
      }
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
      has_project_access: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_tab_access: {
        Args: {
          _access_type?: string
          _app_name: string
          _tab_name: string
          _user_id: string
        }
        Returns: boolean
      }
      has_urban_profile_access: {
        Args: { _profile_id: string; _user_id: string }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
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
