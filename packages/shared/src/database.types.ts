export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ammunition_demands: {
        Row: {
          ammunition_kind_id: string
          booking_id: string
          created_at: string
          facility_id: string
          id: string
          quantity: number
          unit_price_gr: number
        }
        Insert: {
          ammunition_kind_id: string
          booking_id: string
          created_at?: string
          facility_id: string
          id?: string
          quantity: number
          unit_price_gr: number
        }
        Update: {
          ammunition_kind_id?: string
          booking_id?: string
          created_at?: string
          facility_id?: string
          id?: string
          quantity?: number
          unit_price_gr?: number
        }
        Relationships: [
          {
            foreignKeyName: "ammunition_demands_booking_fkey"
            columns: ["booking_id", "facility_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id", "facility_id"]
          },
          {
            foreignKeyName: "ammunition_demands_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ammunition_demands_kind_fkey"
            columns: ["ammunition_kind_id", "facility_id"]
            isOneToOne: false
            referencedRelation: "ammunition_kinds"
            referencedColumns: ["id", "facility_id"]
          },
        ]
      }
      ammunition_kinds: {
        Row: {
          created_at: string
          facility_id: string
          id: string
          name: string
          unit_price_gr: number
        }
        Insert: {
          created_at?: string
          facility_id: string
          id?: string
          name: string
          unit_price_gr?: number
        }
        Update: {
          created_at?: string
          facility_id?: string
          id?: string
          name?: string
          unit_price_gr?: number
        }
        Relationships: [
          {
            foreignKeyName: "ammunition_kinds_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      block_schedules: {
        Row: {
          created_at: string
          duration_minutes: number
          facility_id: string
          id: string
          lane_id: string
          start_minute: number
          weekday: number
        }
        Insert: {
          created_at?: string
          duration_minutes: number
          facility_id: string
          id?: string
          lane_id: string
          start_minute: number
          weekday: number
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          facility_id?: string
          id?: string
          lane_id?: string
          start_minute?: number
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "block_schedules_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_schedules_lane_fkey"
            columns: ["lane_id", "facility_id"]
            isOneToOne: false
            referencedRelation: "lanes"
            referencedColumns: ["id", "facility_id"]
          },
        ]
      }
      bookings: {
        Row: {
          amount_gr: number
          block_rate_gr: number
          confirmation_token: string | null
          confirmed_at: string | null
          consented_at: string
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at: string
          ends_at: string
          expires_at: string | null
          facility_id: string
          has_permit: boolean
          id: string
          instructor_rate_gr: number
          lane_id: string
          participants: number
          participation_rate_gr: number
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          with_instructor: boolean
        }
        Insert: {
          amount_gr: number
          block_rate_gr: number
          confirmation_token?: string | null
          confirmed_at?: string | null
          consented_at?: string
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at?: string
          ends_at: string
          expires_at?: string | null
          facility_id: string
          has_permit: boolean
          id?: string
          instructor_rate_gr: number
          lane_id: string
          participants: number
          participation_rate_gr: number
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          with_instructor: boolean
        }
        Update: {
          amount_gr?: number
          block_rate_gr?: number
          confirmation_token?: string | null
          confirmed_at?: string | null
          consented_at?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          ends_at?: string
          expires_at?: string | null
          facility_id?: string
          has_permit?: boolean
          id?: string
          instructor_rate_gr?: number
          lane_id?: string
          participants?: number
          participation_rate_gr?: number
          starts_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          with_instructor?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bookings_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_lane_fkey"
            columns: ["lane_id", "facility_id"]
            isOneToOne: false
            referencedRelation: "lanes"
            referencedColumns: ["id", "facility_id"]
          },
        ]
      }
      calendar_exceptions: {
        Row: {
          closed_on: string
          created_at: string
          facility_id: string
          id: string
          reason: string | null
        }
        Insert: {
          closed_on: string
          created_at?: string
          facility_id: string
          id?: string
          reason?: string | null
        }
        Update: {
          closed_on?: string
          created_at?: string
          facility_id?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_exceptions_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      facilities: {
        Row: {
          allowed_origins: string[]
          booking_horizon_days: number
          cancellation_window_hours: number
          created_at: string
          id: string
          instructor_pool: number
          instructor_rate_gr: number
          min_lead_minutes: number
          name: string
          participation_rate_gr: number
          slug: string
          timezone: string
        }
        Insert: {
          allowed_origins?: string[]
          booking_horizon_days?: number
          cancellation_window_hours?: number
          created_at?: string
          id?: string
          instructor_pool?: number
          instructor_rate_gr?: number
          min_lead_minutes?: number
          name: string
          participation_rate_gr?: number
          slug: string
          timezone?: string
        }
        Update: {
          allowed_origins?: string[]
          booking_horizon_days?: number
          cancellation_window_hours?: number
          created_at?: string
          id?: string
          instructor_pool?: number
          instructor_rate_gr?: number
          min_lead_minutes?: number
          name?: string
          participation_rate_gr?: number
          slug?: string
          timezone?: string
        }
        Relationships: []
      }
      lanes: {
        Row: {
          block_rate_gr: number
          capacity: number
          created_at: string
          facility_id: string
          id: string
          name: string
        }
        Insert: {
          block_rate_gr?: number
          capacity: number
          created_at?: string
          facility_id: string
          id?: string
          name: string
        }
        Update: {
          block_rate_gr?: number
          capacity?: number
          created_at?: string
          facility_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "lanes_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_outbox: {
        Row: {
          body_html: string
          body_text: string
          booking_id: string | null
          created_at: string
          facility_id: string
          id: string
          recipient: string
          subject: string
        }
        Insert: {
          body_html: string
          body_text: string
          booking_id?: string | null
          created_at?: string
          facility_id: string
          id?: string
          recipient: string
          subject: string
        }
        Update: {
          body_html?: string
          body_text?: string
          booking_id?: string | null
          created_at?: string
          facility_id?: string
          id?: string
          recipient?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "mail_outbox_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_outbox_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      opening_hours: {
        Row: {
          closes_minute: number
          created_at: string
          facility_id: string
          id: string
          opens_minute: number
          weekday: number
        }
        Insert: {
          closes_minute: number
          created_at?: string
          facility_id: string
          id?: string
          opens_minute: number
          weekday: number
        }
        Update: {
          closes_minute?: number
          created_at?: string
          facility_id?: string
          id?: string
          opens_minute?: number
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "opening_hours_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      weapon_rentals: {
        Row: {
          booking_id: string
          created_at: string
          facility_id: string
          id: string
          quantity: number
          unit_price_gr: number
          weapon_type_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          facility_id: string
          id?: string
          quantity: number
          unit_price_gr: number
          weapon_type_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          facility_id?: string
          id?: string
          quantity?: number
          unit_price_gr?: number
          weapon_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weapon_rentals_booking_fkey"
            columns: ["booking_id", "facility_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id", "facility_id"]
          },
          {
            foreignKeyName: "weapon_rentals_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weapon_rentals_weapon_type_fkey"
            columns: ["weapon_type_id", "facility_id"]
            isOneToOne: false
            referencedRelation: "weapon_types"
            referencedColumns: ["id", "facility_id"]
          },
        ]
      }
      weapon_types: {
        Row: {
          created_at: string
          facility_id: string
          id: string
          name: string
          pool: number
          unit_price_gr: number
        }
        Insert: {
          created_at?: string
          facility_id: string
          id?: string
          name: string
          pool: number
          unit_price_gr?: number
        }
        Update: {
          created_at?: string
          facility_id?: string
          id?: string
          name?: string
          pool?: number
          unit_price_gr?: number
        }
        Relationships: [
          {
            foreignKeyName: "weapon_types_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      lane_occupancy: {
        Row: {
          ends_at: string | null
          facility_id: string | null
          lane_id: string | null
          starts_at: string | null
          with_instructor: boolean | null
        }
        Insert: {
          ends_at?: string | null
          facility_id?: string | null
          lane_id?: string | null
          starts_at?: string | null
          with_instructor?: boolean | null
        }
        Update: {
          ends_at?: string | null
          facility_id?: string | null
          lane_id?: string | null
          starts_at?: string | null
          with_instructor?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_lane_fkey"
            columns: ["lane_id", "facility_id"]
            isOneToOne: false
            referencedRelation: "lanes"
            referencedColumns: ["id", "facility_id"]
          },
        ]
      }
      weapon_occupancy: {
        Row: {
          ends_at: string | null
          facility_id: string | null
          quantity: number | null
          starts_at: string | null
          weapon_type_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      booking_holds_term: {
        Args: {
          p_expires_at: string
          p_status: Database["public"]["Enums"]["booking_status"]
        }
        Returns: boolean
      }
      confirm_booking: {
        Args: { p_token: string }
        Returns: {
          final_status: Database["public"]["Enums"]["booking_status"]
          just_confirmed: boolean
        }[]
      }
      expire_stale_bookings: {
        Args: { p_facility_id: string }
        Returns: number
      }
      place_booking: {
        Args: {
          p_ammunition: Json
          p_amount_gr: number
          p_block_rate_gr: number
          p_confirmation_token: string
          p_contact_email: string
          p_contact_name: string
          p_contact_phone: string
          p_ends_at: string
          p_facility_id: string
          p_has_permit: boolean
          p_hold_minutes: number
          p_instructor_rate_gr: number
          p_lane_id: string
          p_participants: number
          p_participation_rate_gr: number
          p_rentals: Json
          p_starts_at: string
          p_status: Database["public"]["Enums"]["booking_status"]
          p_with_instructor: boolean
        }
        Returns: string
      }
    }
    Enums: {
      booking_status:
        | "oczekujaca"
        | "potwierdzona"
        | "anulowana-przez-klienta"
        | "odwolana-przez-strzelnice"
        | "wygasla"
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
      booking_status: [
        "oczekujaca",
        "potwierdzona",
        "anulowana-przez-klienta",
        "odwolana-przez-strzelnice",
        "wygasla",
      ],
    },
  },
} as const

