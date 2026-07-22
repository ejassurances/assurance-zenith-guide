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
      commissions: {
        Row: {
          beneficiaire_id: string
          created_at: string
          date_versement: string | null
          dossier_id: string
          id: string
          montant: number
          notes: string | null
          statut: Database["public"]["Enums"]["commission_statut"]
          updated_at: string
        }
        Insert: {
          beneficiaire_id: string
          created_at?: string
          date_versement?: string | null
          dossier_id: string
          id?: string
          montant: number
          notes?: string | null
          statut?: Database["public"]["Enums"]["commission_statut"]
          updated_at?: string
        }
        Update: {
          beneficiaire_id?: string
          created_at?: string
          date_versement?: string | null
          dossier_id?: string
          id?: string
          montant?: number
          notes?: string | null
          statut?: Database["public"]["Enums"]["commission_statut"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          dossier_id: string
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          storage_path: string
          uploader_id: string
        }
        Insert: {
          created_at?: string
          dossier_id: string
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          storage_path: string
          uploader_id: string
        }
        Update: {
          created_at?: string
          dossier_id?: string
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          storage_path?: string
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      dossiers: {
        Row: {
          age: number | null
          apporteur_id: string | null
          capital: number | null
          client_email: string | null
          client_id: string | null
          client_nom: string
          client_phone: string | null
          created_at: string
          created_by: string | null
          duree_mois: number | null
          economie_estimee: number | null
          fumeur: boolean | null
          id: string
          notes: string | null
          reference: string
          statut: Database["public"]["Enums"]["dossier_statut"]
          updated_at: string
        }
        Insert: {
          age?: number | null
          apporteur_id?: string | null
          capital?: number | null
          client_email?: string | null
          client_id?: string | null
          client_nom: string
          client_phone?: string | null
          created_at?: string
          created_by?: string | null
          duree_mois?: number | null
          economie_estimee?: number | null
          fumeur?: boolean | null
          id?: string
          notes?: string | null
          reference?: string
          statut?: Database["public"]["Enums"]["dossier_statut"]
          updated_at?: string
        }
        Update: {
          age?: number | null
          apporteur_id?: string | null
          capital?: number | null
          client_email?: string | null
          client_id?: string | null
          client_nom?: string
          client_phone?: string | null
          created_at?: string
          created_by?: string | null
          duree_mois?: number | null
          economie_estimee?: number | null
          fumeur?: boolean | null
          id?: string
          notes?: string | null
          reference?: string
          statut?: Database["public"]["Enums"]["dossier_statut"]
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          auteur_id: string
          contenu: string
          created_at: string
          dossier_id: string
          id: string
        }
        Insert: {
          auteur_id: string
          contenu: string
          created_at?: string
          dossier_id: string
          id?: string
        }
        Update: {
          auteur_id?: string
          contenu?: string
          created_at?: string
          dossier_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
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
          role: Database["public"]["Enums"]["app_role"]
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
      can_access_dossier: { Args: { _dossier_id: string }; Returns: boolean }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
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
      app_role: "admin" | "mandataire" | "client" | "prescripteur"
      commission_statut: "prevue" | "versee" | "annulee"
      dossier_statut: "nouveau" | "en_cours" | "signe" | "perdu"
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
      app_role: ["admin", "mandataire", "client", "prescripteur"],
      commission_statut: ["prevue", "versee", "annulee"],
      dossier_statut: ["nouveau", "en_cours", "signe", "perdu"],
    },
  },
} as const
