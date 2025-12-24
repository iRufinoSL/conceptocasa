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
          external_unit_cost: number | null
          id: string
          manual_units: number | null
          name: string
          related_units: number | null
          resource_type: string | null
          safety_margin_percent: number | null
          sales_margin_percent: number | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          activity_id?: string | null
          budget_id: string
          created_at?: string | null
          description?: string | null
          external_unit_cost?: number | null
          id?: string
          manual_units?: number | null
          name: string
          related_units?: number | null
          resource_type?: string | null
          safety_margin_percent?: number | null
          sales_margin_percent?: number | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_id?: string | null
          budget_id?: string
          created_at?: string | null
          description?: string | null
          external_unit_cost?: number | null
          id?: string
          manual_units?: number | null
          name?: string
          related_units?: number | null
          resource_type?: string | null
          safety_margin_percent?: number | null
          sales_margin_percent?: number | null
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
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
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
          updated_at: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
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
      presupuestos: {
        Row: {
          archived: boolean
          codigo_correlativo: number
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
          updated_at: string | null
          version: string
        }
        Insert: {
          archived?: boolean
          codigo_correlativo: number
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
          updated_at?: string | null
          version: string
        }
        Update: {
          archived?: boolean
          codigo_correlativo?: number
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
          created_at: string | null
          description: string | null
          document_type: string | null
          document_url: string | null
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
          created_at?: string | null
          description?: string | null
          document_type?: string | null
          document_url?: string | null
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
          created_at?: string | null
          description?: string | null
          document_type?: string | null
          document_url?: string | null
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
          project_type: string | null
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
          project_type?: string | null
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
          project_type?: string | null
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
