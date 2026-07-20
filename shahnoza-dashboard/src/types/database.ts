// Hand-written Database types mirroring supabase/migrations.
// Regenerate from the live DB with: pnpm db:types
// (supabase gen types typescript --project-id <ref> > src/types/database.ts)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole =
  | "super_admin"
  | "owner"
  | "sales_manager"
  | "sales"
  | "curator";

export type PaymentProvider = "click" | "payme" | "uzum_nasiya";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          auth_id: string | null;
          email: string;
          full_name: string;
          role: UserRole | null;
          phone: string | null;
          telegram_id: string | null;
          amocrm_user_id: number | null;
          avatar_url: string | null;
          is_active: boolean;
          space_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_id?: string | null;
          email: string;
          full_name: string;
          role?: UserRole | null;
          phone?: string | null;
          telegram_id?: string | null;
          amocrm_user_id?: number | null;
          avatar_url?: string | null;
          is_active?: boolean;
          space_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
      user_compensation: {
        Row: {
          id: string;
          user_id: string | null;
          base_salary_usd: number | null;
          commission_rate: number | null;
          bonus_rate: number | null;
          effective_from: string;
          effective_to: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          base_salary_usd?: number | null;
          commission_rate?: number | null;
          bonus_rate?: number | null;
          effective_from: string;
          effective_to?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["user_compensation"]["Insert"]
        >;
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          name: string;
          price_uzs: number | null;
          price_usd: number | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          price_uzs?: number | null;
          price_usd?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      traffic_sources: {
        Row: {
          id: string;
          name: string;
          category: string | null;
          utm_source: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category?: string | null;
          utm_source?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["traffic_sources"]["Insert"]
        >;
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          amocrm_lead_id: number | null;
          full_name: string | null;
          phone: string | null;
          email: string | null;
          telegram_username: string | null;
          traffic_source_id: string | null;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_content: string | null;
          ad_id: string | null;
          status: string;
          assigned_to: string | null;
          amocrm_status_id: number | null;
          amocrm_pipeline_id: number | null;
          created_at: string;
          qualified_at: string | null;
          sold_at: string | null;
          lost_at: string | null;
          lost_reason: string | null;
          last_activity_at: string | null;
          pipeline_name: string | null;
          stage_name: string | null;
          source_name: string | null;
          tarif: string | null;
          payment_method: string | null;
          cancel_reason: string | null;
          segment: string | null;
          region: string | null;
          goal: string | null;
          course_format: string | null;
          manager_name: string | null;
          amount_uzs: number | null;
          outstanding_uzs: number | null;
          finished_course: boolean | null;
          course_started_at: string | null;
        };
        Insert: {
          id?: string;
          amocrm_lead_id?: number | null;
          full_name?: string | null;
          phone?: string | null;
          email?: string | null;
          telegram_username?: string | null;
          traffic_source_id?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_content?: string | null;
          ad_id?: string | null;
          status?: string;
          assigned_to?: string | null;
          amocrm_status_id?: number | null;
          amocrm_pipeline_id?: number | null;
          created_at?: string;
          qualified_at?: string | null;
          sold_at?: string | null;
          lost_at?: string | null;
          lost_reason?: string | null;
          last_activity_at?: string | null;
          pipeline_name?: string | null;
          stage_name?: string | null;
          source_name?: string | null;
          tarif?: string | null;
          payment_method?: string | null;
          cancel_reason?: string | null;
          segment?: string | null;
          region?: string | null;
          goal?: string | null;
          course_format?: string | null;
          manager_name?: string | null;
          amount_uzs?: number | null;
          outstanding_uzs?: number | null;
          finished_course?: boolean | null;
          course_started_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
      sales: {
        Row: {
          id: string;
          amocrm_lead_id: number | null;
          lead_id: string | null;
          product_id: string | null;
          sales_person_id: string | null;
          total_amount_usd: number | null;
          total_amount_uzs: number | null;
          payment_type: string | null;
          payment_provider: PaymentProvider | null;
          sold_at: string;
          is_refunded: boolean;
          refund_amount_usd: number | null;
          refund_reason: string | null;
          refunded_at: string | null;
          notes: string | null;
          created_at: string;
          account_id: string | null;
        };
        Insert: {
          id?: string;
          amocrm_lead_id?: number | null;
          lead_id?: string | null;
          product_id?: string | null;
          sales_person_id?: string | null;
          total_amount_usd?: number | null;
          total_amount_uzs?: number | null;
          payment_type?: string | null;
          payment_provider?: PaymentProvider | null;
          sold_at: string;
          is_refunded?: boolean;
          refund_amount_usd?: number | null;
          refund_reason?: string | null;
          refunded_at?: string | null;
          notes?: string | null;
          created_at?: string;
          account_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sales"]["Insert"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          sale_id: string | null;
          amount_usd: number | null;
          status: string | null;
          due_date: string | null;
          paid_at: string | null;
          provider: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sale_id?: string | null;
          amount_usd?: number | null;
          status?: string | null;
          due_date?: string | null;
          paid_at?: string | null;
          provider?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [];
      };
      expense_categories: {
        Row: {
          id: string;
          name: string | null;
          is_variable: boolean;
          is_pilot_expense: boolean;
          display_order: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name?: string | null;
          is_variable?: boolean;
          is_pilot_expense?: boolean;
          display_order?: number | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["expense_categories"]["Insert"]
        >;
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          category_id: string | null;
          amount: number | null;
          currency: string;
          amount_usd: number | null;
          description: string | null;
          expense_date: string;
          paid_to: string | null;
          receipt_url: string | null;
          created_by: string | null;
          created_at: string;
          source: string | null;
          telegram_chat_id: string | null;
          telegram_message_id: number | null;
          telegram_confirm_message_id: number | null;
          telegram_user_id: string | null;
          account_id: string | null;
        };
        Insert: {
          id?: string;
          category_id?: string | null;
          amount?: number | null;
          currency?: string;
          amount_usd?: number | null;
          description?: string | null;
          expense_date: string;
          paid_to?: string | null;
          receipt_url?: string | null;
          created_by?: string | null;
          created_at?: string;
          source?: string | null;
          telegram_chat_id?: string | null;
          telegram_message_id?: number | null;
          telegram_confirm_message_id?: number | null;
          telegram_user_id?: string | null;
          account_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["expenses"]["Insert"]>;
        Relationships: [];
      };
      commissions: {
        Row: {
          id: string;
          user_id: string | null;
          sale_id: string | null;
          amount_usd: number | null;
          rate: number | null;
          status: string;
          paid_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          sale_id?: string | null;
          amount_usd?: number | null;
          rate?: number | null;
          status?: string;
          paid_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["commissions"]["Insert"]>;
        Relationships: [];
      };
      monthly_bonuses: {
        Row: {
          id: string;
          user_id: string | null;
          month: string | null;
          cash_collected: number | null;
          total_expenses: number | null;
          net_profit: number | null;
          bonus_rate: number | null;
          bonus_amount: number | null;
          status: string;
          approved_by: string | null;
          paid_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          month?: string | null;
          cash_collected?: number | null;
          total_expenses?: number | null;
          net_profit?: number | null;
          bonus_rate?: number | null;
          bonus_amount?: number | null;
          status?: string;
          approved_by?: string | null;
          paid_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["monthly_bonuses"]["Insert"]
        >;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          assigned_to: string | null;
          created_by: string | null;
          priority: string;
          status: string;
          category: string | null;
          related_type: string | null;
          related_id: string | null;
          due_date: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
          start_date: string | null;
          started_at: string | null;
          estimate_hours: number | null;
          labels: string[] | null;
          parent_task_id: string | null;
          recurrence: string | null;
          telegram_chat_id: string | null;
          telegram_confirm_message_id: number | null;
          space_id: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          assigned_to?: string | null;
          created_by?: string | null;
          priority?: string;
          status?: string;
          category?: string | null;
          related_type?: string | null;
          related_id?: string | null;
          due_date?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          start_date?: string | null;
          started_at?: string | null;
          estimate_hours?: number | null;
          labels?: string[] | null;
          parent_task_id?: string | null;
          recurrence?: string | null;
          telegram_chat_id?: string | null;
          telegram_confirm_message_id?: number | null;
          space_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
        Relationships: [];
      };
      task_spaces: {
        Row: {
          id: string;
          name: string;
          color: string | null;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          color?: string | null;
          position?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["task_spaces"]["Insert"]>;
        Relationships: [];
      };
      ai_usage_log: {
        Row: {
          id: string;
          user_id: string | null;
          feature: string;
          model: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          success: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          feature: string;
          model?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          success?: boolean | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_usage_log"]["Insert"]>;
        Relationships: [];
      };
      app_settings: {
        Row: {
          key: string;
          value: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          key: string;
          value?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["app_settings"]["Insert"]>;
        Relationships: [];
      };
      task_assignees: {
        Row: {
          task_id: string;
          user_id: string;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          task_id: string;
          user_id: string;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["task_assignees"]["Insert"]>;
        Relationships: [];
      };
      task_checklist_items: {
        Row: {
          id: string;
          task_id: string;
          content: string;
          is_done: boolean;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          content: string;
          is_done?: boolean;
          position?: number;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["task_checklist_items"]["Insert"]
        >;
        Relationships: [];
      };
      sales_targets: {
        Row: {
          id: string;
          user_id: string;
          month: string;
          target_uzs: number;
          target_deals: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          month: string;
          target_uzs?: number;
          target_deals?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sales_targets"]["Insert"]>;
        Relationships: [];
      };
      call_reviews: {
        Row: {
          id: string;
          rep_user_id: string | null;
          lead_id: string | null;
          title: string | null;
          transcript: string | null;
          score: number | null;
          scores: Json | null;
          outcome: string | null;
          summary: string | null;
          strengths: Json | null;
          improvements: Json | null;
          red_flags: Json | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          rep_user_id?: string | null;
          lead_id?: string | null;
          title?: string | null;
          transcript?: string | null;
          score?: number | null;
          scores?: Json | null;
          outcome?: string | null;
          summary?: string | null;
          strengths?: Json | null;
          improvements?: Json | null;
          red_flags?: Json | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["call_reviews"]["Insert"]>;
        Relationships: [];
      };
      brain_chats: {
        Row: {
          chat_key: string;
          messages: Json;
          updated_at: string;
        };
        Insert: {
          chat_key: string;
          messages?: Json;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["brain_chats"]["Insert"]>;
        Relationships: [];
      };
      files: {
        Row: {
          id: string;
          space_id: string | null;
          task_id: string | null;
          kind: "upload" | "link";
          name: string;
          storage_path: string | null;
          url: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          space_id?: string | null;
          task_id?: string | null;
          kind?: "upload" | "link";
          name: string;
          storage_path?: string | null;
          url?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["files"]["Insert"]>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["push_subscriptions"]["Insert"]
        >;
        Relationships: [];
      };
      task_comments: {
        Row: {
          id: string;
          task_id: string | null;
          user_id: string | null;
          content: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id?: string | null;
          user_id?: string | null;
          content?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["task_comments"]["Insert"]
        >;
        Relationships: [];
      };
      integration_tokens: {
        Row: {
          id: string;
          service: string;
          access_token: string | null;
          refresh_token: string | null;
          expires_at: string | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          service: string;
          access_token?: string | null;
          refresh_token?: string | null;
          expires_at?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["integration_tokens"]["Insert"]
        >;
        Relationships: [];
      };
      sync_logs: {
        Row: {
          id: string;
          service: string;
          status: string | null;
          records_synced: number | null;
          error_message: string | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          service: string;
          status?: string | null;
          records_synced?: number | null;
          error_message?: string | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sync_logs"]["Insert"]>;
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          name: string;
          kind: string | null;
          currency: string;
          is_active: boolean;
          sort_order: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          kind?: string | null;
          currency?: string;
          is_active?: boolean;
          sort_order?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Insert"]>;
        Relationships: [];
      };
      account_transactions: {
        Row: {
          id: string;
          account_id: string | null;
          direction: "in" | "out";
          kind: string;
          amount: number;
          currency: string;
          amount_usd: number | null;
          rate: number | null;
          description: string | null;
          related_type: string | null;
          related_id: string | null;
          transfer_group: string | null;
          occurred_at: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id?: string | null;
          direction: "in" | "out";
          kind?: string;
          amount: number;
          currency: string;
          amount_usd?: number | null;
          rate?: number | null;
          description?: string | null;
          related_type?: string | null;
          related_id?: string | null;
          transfer_group?: string | null;
          occurred_at?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["account_transactions"]["Insert"]
        >;
        Relationships: [];
      };
      fx_rates: {
        Row: {
          id: string;
          base: string;
          quote: string;
          rate: number;
          source: string | null;
          as_of: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          base?: string;
          quote?: string;
          rate: number;
          source?: string | null;
          as_of?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["fx_rates"]["Insert"]>;
        Relationships: [];
      };
      owner_shares: {
        Row: {
          id: string;
          user_id: string | null;
          share_rate: number;
          bears_loss: boolean;
          effective_from: string;
          effective_to: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          share_rate: number;
          bears_loss?: boolean;
          effective_from: string;
          effective_to?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["owner_shares"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      app_uid: { Args: Record<string, never>; Returns: string };
      app_role: { Args: Record<string, never>; Returns: string };
      app_space: { Args: Record<string, never>; Returns: string };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience row aliases.
type T = Database["public"]["Tables"];
export type UserRow = T["users"]["Row"];
export type CompensationRow = T["user_compensation"]["Row"];
export type ProductRow = T["products"]["Row"];
export type TrafficSourceRow = T["traffic_sources"]["Row"];
export type LeadRow = T["leads"]["Row"];
export type SaleRow = T["sales"]["Row"];
export type PaymentRow = T["payments"]["Row"];
export type ExpenseCategoryRow = T["expense_categories"]["Row"];
export type ExpenseRow = T["expenses"]["Row"];
export type CommissionRow = T["commissions"]["Row"];
export type MonthlyBonusRow = T["monthly_bonuses"]["Row"];
export type TaskRow = T["tasks"]["Row"];
export type TaskSpaceRow = T["task_spaces"]["Row"];
export type TaskCommentRow = T["task_comments"]["Row"];
export type IntegrationTokenRow = T["integration_tokens"]["Row"];
export type SyncLogRow = T["sync_logs"]["Row"];
export type AccountRow = T["accounts"]["Row"];
export type AccountTransactionRow = T["account_transactions"]["Row"];
export type FxRateRow = T["fx_rates"]["Row"];
