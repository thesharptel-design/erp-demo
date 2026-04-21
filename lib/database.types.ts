/**
 * Supabase-generated style database typings (subset).
 * Regenerate broadly with: `npx supabase gen types typescript --project-id <id> > lib/database.types.ts`
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      approval_docs: {
        Row: {
          id: number
          doc_no: string | null
          title: string | null
          status: string
          remarks: string | null
          content: string | null
          drafted_at: string | null
          completed_at: string | null
          writer_id: string | null
          dept_id: number | null
          doc_type: string | null
          current_line_no: number | null
        }
        Insert: Partial<Database['public']['Tables']['approval_docs']['Row']>
        Update: Partial<Database['public']['Tables']['approval_docs']['Row']>
      }
      approval_lines: {
        Row: {
          id: number
          approval_doc_id: number
          line_no: number
          approver_id: string
          approver_role: string
          status: string
          acted_at: string | null
          opinion: string | null
        }
        Insert: Partial<Database['public']['Tables']['approval_lines']['Row']>
        Update: Partial<Database['public']['Tables']['approval_lines']['Row']>
      }
      approval_participants: {
        Row: {
          id: number
          approval_doc_id: number
          user_id: string
          role: string
          line_no: number | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['approval_participants']['Row']>
        Update: Partial<Database['public']['Tables']['approval_participants']['Row']>
      }
      outbound_requests: {
        Row: {
          id: number
          req_no: string | null
          req_date: string
          requester_id: string
          customer_id: number | null
          purpose: string | null
          remarks: string | null
          status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'completed' | 'cancelled'
          approval_doc_id: number | null
          outbound_completed: boolean
          warehouse_id: number
          created_at: string
          updated_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['outbound_requests']['Row']>
        Update: Partial<Database['public']['Tables']['outbound_requests']['Row']>
      }
      inventory: {
        Row: {
          id: number
          item_id: number
          current_qty: number
          available_qty: number
          quarantine_qty: number | null
          lot_no: string | null
          exp_date: string | null
          serial_no: string | null
          warehouse_id: number
          updated_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['inventory']['Row']>
        Update: Partial<Database['public']['Tables']['inventory']['Row']>
      }
      inventory_transactions: {
        Row: {
          id: number
          item_id: number
          trans_type: string
          qty: number
          lot_no: string | null
          exp_date: string | null
          serial_no: string | null
          remarks: string | null
          trans_date: string
          actor_id: string | null
          created_by: string | null
          ref_table: string | null
          ref_id: number | null
          inventory_id: number | null
          warehouse_id: number | null
        }
        Insert: Partial<Database['public']['Tables']['inventory_transactions']['Row']>
        Update: Partial<Database['public']['Tables']['inventory_transactions']['Row']>
      }
      items: {
        Row: {
          id: number
          item_code: string
          item_name: string
          item_spec: string | null
          unit: string | null
          item_type: string
          sales_price: number
          purchase_price: number
          manufacturer: string | null
          remarks: string | null
          /** See migration comment: category, checks, sopFiles (all optional keys). */
          process_metadata: Json
          is_active: boolean
          is_lot_managed: boolean
          is_exp_managed: boolean
          is_sn_managed: boolean
        }
        Insert: Partial<Database['public']['Tables']['items']['Row']>
        Update: Partial<Database['public']['Tables']['items']['Row']>
      }
      item_process_config: {
        Row: {
          id: number
          categories: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: Partial<Database['public']['Tables']['item_process_config']['Row']>
        Update: Partial<Database['public']['Tables']['item_process_config']['Row']>
      }
      app_users: {
        Row: {
          id: string
          user_name: string | null
          login_id: string | null
          role_name: string | null
          role: string | null
          dept_id: number | null
          employee_no: string | null
        }
        Insert: Partial<Database['public']['Tables']['app_users']['Row']>
        Update: Partial<Database['public']['Tables']['app_users']['Row']>
      }
      warehouses: {
        Row: {
          id: number
          code: string
          name: string
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['warehouses']['Row']>
        Update: Partial<Database['public']['Tables']['warehouses']['Row']>
      }
      login_audit_logs: {
        Row: {
          id: number
          user_id: string | null
          email: string | null
          login_at: string
          ip: string | null
          user_agent: string | null
          success: boolean
          session_id: string | null
        }
        Insert: Partial<Database['public']['Tables']['login_audit_logs']['Row']>
        Update: Partial<Database['public']['Tables']['login_audit_logs']['Row']>
      }
      coa_files: {
        Row: {
          id: number
          item_id: number
          warehouse_id: number | null
          version_no: number
          file_name: string
          storage_path: string
          mime_type: string | null
          file_size: number | null
          is_active: boolean
          uploaded_by: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['coa_files']['Row']>
        Update: Partial<Database['public']['Tables']['coa_files']['Row']>
      }
    }
    Views: Record<string, never>
    Functions: {
      execute_outbound_request_fulfillment: {
        Args: { p_outbound_request_id: number; p_lines: Json }
        Returns: undefined
      }
      finalize_outbound_cancellation: {
        Args: { p_doc_id: number }
        Returns: undefined
      }
      next_employee_no: {
        Args: { p_now?: string }
        Returns: string
      }
    }
    Enums: Record<string, never>
  }
}
