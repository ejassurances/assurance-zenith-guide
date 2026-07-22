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
      activites: {
        Row: {
          client_id: string
          contenu: string | null
          created_at: string
          created_by: string | null
          id: string
          titre: string | null
          type: Database["public"]["Enums"]["activite_type"]
        }
        Insert: {
          client_id: string
          contenu?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          titre?: string | null
          type?: Database["public"]["Enums"]["activite_type"]
        }
        Update: {
          client_id?: string
          contenu?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          titre?: string | null
          type?: Database["public"]["Enums"]["activite_type"]
        }
        Relationships: [
          {
            foreignKeyName: "activites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          adresse: string | null
          apporteur_id: string | null
          civilite: string | null
          code_postal: string | null
          commercial_id: string | null
          complement_adresse: string | null
          created_at: string
          created_by: string | null
          csp: string | null
          date_naissance: string | null
          email: string | null
          email2: string | null
          etiquettes: string[] | null
          fumeur: boolean | null
          id: string
          metier: string | null
          mobile: string | null
          mobile2: string | null
          nationalite: string | null
          nom: string
          nom_naissance: string | null
          numero_secu: string | null
          origine: Database["public"]["Enums"]["client_origine"] | null
          pays: string | null
          pays_naissance: string | null
          preference_contact: string | null
          prenom: string | null
          reference: string
          remarque: string | null
          situation_familiale: string | null
          statut: Database["public"]["Enums"]["client_statut"]
          telephone: string | null
          telephone2: string | null
          updated_at: string
          ville: string | null
          ville_naissance: string | null
        }
        Insert: {
          adresse?: string | null
          apporteur_id?: string | null
          civilite?: string | null
          code_postal?: string | null
          commercial_id?: string | null
          complement_adresse?: string | null
          created_at?: string
          created_by?: string | null
          csp?: string | null
          date_naissance?: string | null
          email?: string | null
          email2?: string | null
          etiquettes?: string[] | null
          fumeur?: boolean | null
          id?: string
          metier?: string | null
          mobile?: string | null
          mobile2?: string | null
          nationalite?: string | null
          nom: string
          nom_naissance?: string | null
          numero_secu?: string | null
          origine?: Database["public"]["Enums"]["client_origine"] | null
          pays?: string | null
          pays_naissance?: string | null
          preference_contact?: string | null
          prenom?: string | null
          reference?: string
          remarque?: string | null
          situation_familiale?: string | null
          statut?: Database["public"]["Enums"]["client_statut"]
          telephone?: string | null
          telephone2?: string | null
          updated_at?: string
          ville?: string | null
          ville_naissance?: string | null
        }
        Update: {
          adresse?: string | null
          apporteur_id?: string | null
          civilite?: string | null
          code_postal?: string | null
          commercial_id?: string | null
          complement_adresse?: string | null
          created_at?: string
          created_by?: string | null
          csp?: string | null
          date_naissance?: string | null
          email?: string | null
          email2?: string | null
          etiquettes?: string[] | null
          fumeur?: boolean | null
          id?: string
          metier?: string | null
          mobile?: string | null
          mobile2?: string | null
          nationalite?: string | null
          nom?: string
          nom_naissance?: string | null
          numero_secu?: string | null
          origine?: Database["public"]["Enums"]["client_origine"] | null
          pays?: string | null
          pays_naissance?: string | null
          preference_contact?: string | null
          prenom?: string | null
          reference?: string
          remarque?: string | null
          situation_familiale?: string | null
          statut?: Database["public"]["Enums"]["client_statut"]
          telephone?: string | null
          telephone2?: string | null
          updated_at?: string
          ville?: string | null
          ville_naissance?: string | null
        }
        Relationships: []
      }
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
          client_id: string | null
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
          client_id?: string | null
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
          client_id?: string | null
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
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
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
      taches: {
        Row: {
          assignee_id: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          echeance: string | null
          id: string
          priorite: Database["public"]["Enums"]["tache_priorite"]
          statut: Database["public"]["Enums"]["tache_statut"]
          titre: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          echeance?: string | null
          id?: string
          priorite?: Database["public"]["Enums"]["tache_priorite"]
          statut?: Database["public"]["Enums"]["tache_statut"]
          titre: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          echeance?: string | null
          id?: string
          priorite?: Database["public"]["Enums"]["tache_priorite"]
          statut?: Database["public"]["Enums"]["tache_statut"]
          titre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
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
      can_access_client: { Args: { _client_id: string }; Returns: boolean }
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
      activite_type: "note" | "appel" | "email" | "sms" | "systeme" | "rdv"
      app_role: "admin" | "mandataire" | "client" | "prescripteur"
      client_origine:
        | "internet"
        | "assurlead"
        | "telephone"
        | "apporteur"
        | "reseau"
        | "autre"
      client_statut: "prospect" | "actif" | "inactif" | "perdu" | "ancien"
      commission_statut: "prevue" | "versee" | "annulee"
      dossier_statut: "nouveau" | "en_cours" | "signe" | "perdu"
      tache_priorite: "basse" | "normale" | "haute" | "urgente"
      tache_statut: "a_faire" | "en_cours" | "terminee" | "annulee"
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
      activite_type: ["note", "appel", "email", "sms", "systeme", "rdv"],
      app_role: ["admin", "mandataire", "client", "prescripteur"],
      client_origine: [
        "internet",
        "assurlead",
        "telephone",
        "apporteur",
        "reseau",
        "autre",
      ],
      client_statut: ["prospect", "actif", "inactif", "perdu", "ancien"],
      commission_statut: ["prevue", "versee", "annulee"],
      dossier_statut: ["nouveau", "en_cours", "signe", "perdu"],
      tache_priorite: ["basse", "normale", "haute", "urgente"],
      tache_statut: ["a_faire", "en_cours", "terminee", "annulee"],
    },
  },
} as const
