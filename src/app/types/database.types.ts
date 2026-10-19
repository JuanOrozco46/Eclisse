export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole = 'ADMIN' | 'WAITER' | 'KITCHEN';
export type StaffStatus = 'ACTIVE' | 'OFFLINE';
export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED' | 'PAID';
export type OrderSource = 'POS' | 'WHATSAPP' | 'RAPPI';
export type DeliveryStatus = 'NONE' | 'REQUESTED' | 'ON_THE_WAY';
export type PaymentStatus = 'UNPAID' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
export type BotStage =
  | 'RECEIVED'
  | 'MENU_SENT'
  | 'RESPONDED'
  | 'ORDER_CONFIRMED'
  | 'ORDER_UPDATED'
  | 'ORDER_INSERTED'
  | 'RECEIPT_RECEIVED'
  | 'VALIDATION_RETRY'
  | 'ERROR';

export interface Database {
  public: {
    Tables: {
      menu_items: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          price: number;
          category: string;
          image: string | null;
          ingredients: Json;
          available: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          price: number;
          category: string;
          image?: string | null;
          ingredients?: Json;
          available?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          price?: number;
          category?: string;
          image?: string | null;
          ingredients?: Json;
          available?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          table: string;
          items: Json;
          total: number;
          delivery_fee: number;
          status: OrderStatus;
          priority: boolean;
          timestamp: number;
          waiter: string | null;
          payment_method: string | null;
          payment_status: PaymentStatus;
          source: OrderSource;
          customer_phone: string | null;
          customer_name: string | null;
          delivery_status: DeliveryStatus;
          rappi_order_id: string | null;
          order_fingerprint: string | null;
          receipt_image: string | null;
          receipt_ai_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          table?: string;
          items?: Json;
          total?: number;
          delivery_fee?: number;
          status?: OrderStatus;
          priority?: boolean;
          timestamp?: number;
          waiter?: string | null;
          payment_method?: string | null;
          payment_status?: PaymentStatus;
          source?: OrderSource;
          customer_phone?: string | null;
          customer_name?: string | null;
          delivery_status?: DeliveryStatus;
          rappi_order_id?: string | null;
          order_fingerprint?: string | null;
          receipt_image?: string | null;
          receipt_ai_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          table?: string;
          items?: Json;
          total?: number;
          delivery_fee?: number;
          status?: OrderStatus;
          priority?: boolean;
          timestamp?: number;
          waiter?: string | null;
          payment_method?: string | null;
          payment_status?: PaymentStatus;
          source?: OrderSource;
          customer_phone?: string | null;
          customer_name?: string | null;
          delivery_status?: DeliveryStatus;
          rappi_order_id?: string | null;
          order_fingerprint?: string | null;
          receipt_image?: string | null;
          receipt_ai_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ingredients: {
        Row: {
          id: string;
          name: string;
          unit: string;
          stock: number;
          min: number;
          category: string;
          cost_per_unit: number;
        };
        Insert: {
          id?: string;
          name: string;
          unit?: string;
          stock?: number;
          min?: number;
          category?: string;
          cost_per_unit?: number;
        };
        Update: {
          id?: string;
          name?: string;
          unit?: string;
          stock?: number;
          min?: number;
          category?: string;
          cost_per_unit?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          name: string | null;
          email: string | null;
          role: AppRole;
          status: StaffStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name?: string | null;
          email?: string | null;
          role?: AppRole;
          status?: StaffStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string | null;
          email?: string | null;
          role?: AppRole;
          status?: StaffStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          type: 'Venta' | 'Gasto';
          category: string;
          amount: number;
          method: string;
          description: string | null;
          date: string;
          timestamp: number;
          order_id: string | null;
        };
        Insert: {
          id: string;
          type: 'Venta' | 'Gasto';
          category?: string;
          amount?: number;
          method?: string;
          description?: string | null;
          date: string;
          timestamp: number;
          order_id?: string | null;
        };
        Update: {
          id?: string;
          type?: 'Venta' | 'Gasto';
          category?: string;
          amount?: number;
          method?: string;
          description?: string | null;
          date?: string;
          timestamp?: number;
          order_id?: string | null;
        };
        Relationships: [];
      };
      rappi_config: {
        Row: {
          id: string;
          connected: boolean;
          store_id: string;
          api_key: string;
          webhook_secret: string;
          connected_at: string | null;
        };
        Insert: {
          id: string;
          connected?: boolean;
          store_id?: string;
          api_key?: string;
          webhook_secret?: string;
          connected_at?: string | null;
        };
        Update: {
          id?: string;
          connected?: boolean;
          store_id?: string;
          api_key?: string;
          webhook_secret?: string;
          connected_at?: string | null;
        };
        Relationships: [];
      };
      bot_conversations: {
        Row: {
          phone: string;
          messages: Json;
          active_order_id: string | null;
          last_fingerprint: string | null;
          updated_at: string;
        };
        Insert: {
          phone: string;
          messages?: Json;
          active_order_id?: string | null;
          last_fingerprint?: string | null;
          updated_at?: string;
        };
        Update: {
          phone?: string;
          messages?: Json;
          active_order_id?: string | null;
          last_fingerprint?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      bot_events: {
        Row: {
          id: number;
          phone: string;
          message_id: string | null;
          stage: BotStage;
          order_id: string | null;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: number;
          phone: string;
          message_id?: string | null;
          stage: BotStage;
          order_id?: string | null;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: number;
          phone?: string;
          message_id?: string | null;
          stage?: BotStage;
          order_id?: string | null;
          details?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      has_any_role: {
        Args: { roles: string[] };
        Returns: boolean;
      };
      clean_old_conversations: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
    };
    Enums: {
      app_role: AppRole;
    };
    CompositeTypes: Record<string, never>;
  };
}
