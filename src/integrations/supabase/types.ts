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
      bordereaux_commissions: {
        Row: {
          assureur: string
          created_at: string
          created_by: string | null
          fichier_source: string | null
          id: string
          montant_total: number
          nb_lignes: number
          notes: string | null
          periode: string
          statut: string
          updated_at: string
        }
        Insert: {
          assureur: string
          created_at?: string
          created_by?: string | null
          fichier_source?: string | null
          id?: string
          montant_total?: number
          nb_lignes?: number
          notes?: string | null
          periode: string
          statut?: string
          updated_at?: string
        }
        Update: {
          assureur?: string
          created_at?: string
          created_by?: string | null
          fichier_source?: string | null
          id?: string
          montant_total?: number
          nb_lignes?: number
          notes?: string | null
          periode?: string
          statut?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_conjoint: {
        Row: {
          client_id: string
          created_at: string
          date_naissance: string | null
          fumeur: boolean
          id: string
          nom: string | null
          notes: string | null
          prenom: string | null
          profession: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          date_naissance?: string | null
          fumeur?: boolean
          id?: string
          nom?: string | null
          notes?: string | null
          prenom?: string | null
          profession?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          date_naissance?: string | null
          fumeur?: boolean
          id?: string
          nom?: string | null
          notes?: string | null
          prenom?: string | null
          profession?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_conjoint_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_enfants: {
        Row: {
          a_charge: boolean
          client_id: string
          created_at: string
          date_naissance: string | null
          id: string
          notes: string | null
          prenom: string
          updated_at: string
        }
        Insert: {
          a_charge?: boolean
          client_id: string
          created_at?: string
          date_naissance?: string | null
          id?: string
          notes?: string | null
          prenom: string
          updated_at?: string
        }
        Update: {
          a_charge?: boolean
          client_id?: string
          created_at?: string
          date_naissance?: string | null
          id?: string
          notes?: string | null
          prenom?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_enfants_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_entreprise: {
        Row: {
          chiffre_affaires: number | null
          client_id: string
          code_ape: string | null
          created_at: string
          date_creation: string | null
          effectif: number | null
          forme_juridique: string | null
          id: string
          notes: string | null
          raison_sociale: string | null
          siret: string | null
          updated_at: string
        }
        Insert: {
          chiffre_affaires?: number | null
          client_id: string
          code_ape?: string | null
          created_at?: string
          date_creation?: string | null
          effectif?: number | null
          forme_juridique?: string | null
          id?: string
          notes?: string | null
          raison_sociale?: string | null
          siret?: string | null
          updated_at?: string
        }
        Update: {
          chiffre_affaires?: number | null
          client_id?: string
          code_ape?: string | null
          created_at?: string
          date_creation?: string | null
          effectif?: number | null
          forme_juridique?: string | null
          id?: string
          notes?: string | null
          raison_sociale?: string | null
          siret?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_entreprise_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_equipements: {
        Row: {
          client_id: string
          created_at: string
          date_acquisition: string | null
          id: string
          libelle: string
          notes: string | null
          type: string
          updated_at: string
          valeur: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          date_acquisition?: string | null
          id?: string
          libelle: string
          notes?: string | null
          type: string
          updated_at?: string
          valeur?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          date_acquisition?: string | null
          id?: string
          libelle?: string
          notes?: string | null
          type?: string
          updated_at?: string
          valeur?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_equipements_client_id_fkey"
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
          lieu_naissance: string | null
          metier: string | null
          mobile: string | null
          mobile2: string | null
          nationalite: string | null
          nb_enfants: number | null
          nom: string
          nom_naissance: string | null
          numero_secu: string | null
          origine: Database["public"]["Enums"]["client_origine"] | null
          pays: string | null
          pays_naissance: string | null
          ppe: boolean
          ppe_fonction: string | null
          ppe_pays: string | null
          preference_contact: string | null
          prenom: string | null
          reference: string
          remarque: string | null
          revenus_annuels: number | null
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
          lieu_naissance?: string | null
          metier?: string | null
          mobile?: string | null
          mobile2?: string | null
          nationalite?: string | null
          nb_enfants?: number | null
          nom: string
          nom_naissance?: string | null
          numero_secu?: string | null
          origine?: Database["public"]["Enums"]["client_origine"] | null
          pays?: string | null
          pays_naissance?: string | null
          ppe?: boolean
          ppe_fonction?: string | null
          ppe_pays?: string | null
          preference_contact?: string | null
          prenom?: string | null
          reference?: string
          remarque?: string | null
          revenus_annuels?: number | null
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
          lieu_naissance?: string | null
          metier?: string | null
          mobile?: string | null
          mobile2?: string | null
          nationalite?: string | null
          nb_enfants?: number | null
          nom?: string
          nom_naissance?: string | null
          numero_secu?: string | null
          origine?: Database["public"]["Enums"]["client_origine"] | null
          pays?: string | null
          pays_naissance?: string | null
          ppe?: boolean
          ppe_fonction?: string | null
          ppe_pays?: string | null
          preference_contact?: string | null
          prenom?: string | null
          reference?: string
          remarque?: string | null
          revenus_annuels?: number | null
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
      commission_regles: {
        Row: {
          assiette: string
          beneficiaire_id: string | null
          compagnie_id: string | null
          created_at: string
          date_effet: string
          date_fin: string | null
          famille_id: string | null
          id: string
          notes: string | null
          portee: string
          produit_id: string | null
          taux: number
          updated_at: string
        }
        Insert: {
          assiette?: string
          beneficiaire_id?: string | null
          compagnie_id?: string | null
          created_at?: string
          date_effet?: string
          date_fin?: string | null
          famille_id?: string | null
          id?: string
          notes?: string | null
          portee: string
          produit_id?: string | null
          taux: number
          updated_at?: string
        }
        Update: {
          assiette?: string
          beneficiaire_id?: string | null
          compagnie_id?: string | null
          created_at?: string
          date_effet?: string
          date_fin?: string | null
          famille_id?: string | null
          id?: string
          notes?: string | null
          portee?: string
          produit_id?: string | null
          taux?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_regles_compagnie_id_fkey"
            columns: ["compagnie_id"]
            isOneToOne: false
            referencedRelation: "compagnies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_regles_famille_id_fkey"
            columns: ["famille_id"]
            isOneToOne: false
            referencedRelation: "produit_familles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_regles_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          beneficiaire_id: string
          bordereau_id: string | null
          contrat_id: string | null
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
          bordereau_id?: string | null
          contrat_id?: string | null
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
          bordereau_id?: string | null
          contrat_id?: string | null
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
            foreignKeyName: "commissions_bordereau_id_fkey"
            columns: ["bordereau_id"]
            isOneToOne: false
            referencedRelation: "bordereaux_commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_contrat_id_fkey"
            columns: ["contrat_id"]
            isOneToOne: false
            referencedRelation: "contrats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      compagnies: {
        Row: {
          api_active: boolean
          api_auth_type: Database["public"]["Enums"]["api_auth_type"]
          api_base_url: string | null
          api_config: Json
          api_secret_name: string | null
          contact_email: string | null
          contact_nom: string | null
          contact_telephone: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          logo_url: string | null
          nom: string
          notes: string | null
          site_web: string | null
          slug: string
          statut: Database["public"]["Enums"]["compagnie_statut"]
          updated_at: string
        }
        Insert: {
          api_active?: boolean
          api_auth_type?: Database["public"]["Enums"]["api_auth_type"]
          api_base_url?: string | null
          api_config?: Json
          api_secret_name?: string | null
          contact_email?: string | null
          contact_nom?: string | null
          contact_telephone?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          nom: string
          notes?: string | null
          site_web?: string | null
          slug: string
          statut?: Database["public"]["Enums"]["compagnie_statut"]
          updated_at?: string
        }
        Update: {
          api_active?: boolean
          api_auth_type?: Database["public"]["Enums"]["api_auth_type"]
          api_base_url?: string | null
          api_config?: Json
          api_secret_name?: string | null
          contact_email?: string | null
          contact_nom?: string | null
          contact_telephone?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          nom?: string
          notes?: string | null
          site_web?: string | null
          slug?: string
          statut?: Database["public"]["Enums"]["compagnie_statut"]
          updated_at?: string
        }
        Relationships: []
      }
      contrat_echeances: {
        Row: {
          annee: number
          bordereau_id: string | null
          capital_restant_du_debut: number | null
          commission_cabinet_periode: number
          commission_mandataire_periode: number
          commission_prescripteur_periode: number
          contrat_id: string
          created_at: string
          date_debut_periode: string
          date_fin_periode: string
          id: string
          mandataire_id: string | null
          prescripteur_id: string | null
          prime_periode: number
          statut: string
          updated_at: string
        }
        Insert: {
          annee: number
          bordereau_id?: string | null
          capital_restant_du_debut?: number | null
          commission_cabinet_periode?: number
          commission_mandataire_periode?: number
          commission_prescripteur_periode?: number
          contrat_id: string
          created_at?: string
          date_debut_periode: string
          date_fin_periode: string
          id?: string
          mandataire_id?: string | null
          prescripteur_id?: string | null
          prime_periode?: number
          statut?: string
          updated_at?: string
        }
        Update: {
          annee?: number
          bordereau_id?: string | null
          capital_restant_du_debut?: number | null
          commission_cabinet_periode?: number
          commission_mandataire_periode?: number
          commission_prescripteur_periode?: number
          contrat_id?: string
          created_at?: string
          date_debut_periode?: string
          date_fin_periode?: string
          id?: string
          mandataire_id?: string | null
          prescripteur_id?: string | null
          prime_periode?: number
          statut?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrat_echeances_bordereau_id_fkey"
            columns: ["bordereau_id"]
            isOneToOne: false
            referencedRelation: "bordereaux_commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrat_echeances_contrat_id_fkey"
            columns: ["contrat_id"]
            isOneToOne: false
            referencedRelation: "contrats"
            referencedColumns: ["id"]
          },
        ]
      }
      contrat_garanties: {
        Row: {
          contrat_id: string
          created_at: string
          franchise: string | null
          id: string
          montant: number | null
          notes: string | null
          quotite: number | null
          type: string
          updated_at: string
        }
        Insert: {
          contrat_id: string
          created_at?: string
          franchise?: string | null
          id?: string
          montant?: number | null
          notes?: string | null
          quotite?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          contrat_id?: string
          created_at?: string
          franchise?: string | null
          id?: string
          montant?: number | null
          notes?: string | null
          quotite?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrat_garanties_contrat_id_fkey"
            columns: ["contrat_id"]
            isOneToOne: false
            referencedRelation: "contrats"
            referencedColumns: ["id"]
          },
        ]
      }
      contrats: {
        Row: {
          assiette: string | null
          assureur: string
          capital_initial: number | null
          client_id: string
          co_emprunteur: Json | null
          commission_cabinet_taux: number | null
          compagnie_id: string | null
          created_at: string
          created_by: string | null
          date_echeance: string | null
          date_effet: string | null
          dossier_id: string | null
          duree_mois: number | null
          fractionnement: string
          id: string
          is_emprunteur: boolean
          mandataire_id: string | null
          mode_commissionnement: string
          notes: string | null
          numero: string | null
          prescripteur_id: string | null
          prime_annuelle: number | null
          produit: string
          produit_id: string | null
          projet_id: string | null
          quotite: number | null
          statut: string
          taux_assurance_annuel: number | null
          taux_pret: number | null
          updated_at: string
        }
        Insert: {
          assiette?: string | null
          assureur: string
          capital_initial?: number | null
          client_id: string
          co_emprunteur?: Json | null
          commission_cabinet_taux?: number | null
          compagnie_id?: string | null
          created_at?: string
          created_by?: string | null
          date_echeance?: string | null
          date_effet?: string | null
          dossier_id?: string | null
          duree_mois?: number | null
          fractionnement?: string
          id?: string
          is_emprunteur?: boolean
          mandataire_id?: string | null
          mode_commissionnement?: string
          notes?: string | null
          numero?: string | null
          prescripteur_id?: string | null
          prime_annuelle?: number | null
          produit: string
          produit_id?: string | null
          projet_id?: string | null
          quotite?: number | null
          statut?: string
          taux_assurance_annuel?: number | null
          taux_pret?: number | null
          updated_at?: string
        }
        Update: {
          assiette?: string | null
          assureur?: string
          capital_initial?: number | null
          client_id?: string
          co_emprunteur?: Json | null
          commission_cabinet_taux?: number | null
          compagnie_id?: string | null
          created_at?: string
          created_by?: string | null
          date_echeance?: string | null
          date_effet?: string | null
          dossier_id?: string | null
          duree_mois?: number | null
          fractionnement?: string
          id?: string
          is_emprunteur?: boolean
          mandataire_id?: string | null
          mode_commissionnement?: string
          notes?: string | null
          numero?: string | null
          prescripteur_id?: string | null
          prime_annuelle?: number | null
          produit?: string
          produit_id?: string | null
          projet_id?: string | null
          quotite?: number | null
          statut?: string
          taux_assurance_annuel?: number | null
          taux_pret?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrats_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrats_compagnie_id_fkey"
            columns: ["compagnie_id"]
            isOneToOne: false
            referencedRelation: "compagnies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrats_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrats_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrats_projet_id_fkey"
            columns: ["projet_id"]
            isOneToOne: false
            referencedRelation: "projets"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          client_id: string | null
          created_at: string
          dossier_id: string | null
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
          dossier_id?: string | null
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
          dossier_id?: string | null
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
      produit_documents: {
        Row: {
          created_at: string
          date_effet: string | null
          id: string
          interne: boolean
          mime_type: string | null
          nom: string
          produit_id: string
          storage_path: string
          taille_bytes: number | null
          type: Database["public"]["Enums"]["produit_document_type"]
          updated_at: string
          uploaded_by: string | null
          version: string | null
        }
        Insert: {
          created_at?: string
          date_effet?: string | null
          id?: string
          interne?: boolean
          mime_type?: string | null
          nom: string
          produit_id: string
          storage_path: string
          taille_bytes?: number | null
          type: Database["public"]["Enums"]["produit_document_type"]
          updated_at?: string
          uploaded_by?: string | null
          version?: string | null
        }
        Update: {
          created_at?: string
          date_effet?: string | null
          id?: string
          interne?: boolean
          mime_type?: string | null
          nom?: string
          produit_id?: string
          storage_path?: string
          taille_bytes?: number | null
          type?: Database["public"]["Enums"]["produit_document_type"]
          updated_at?: string
          uploaded_by?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produit_documents_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      produit_familles: {
        Row: {
          champs_standards: Json
          code: string
          created_at: string
          description: string | null
          id: string
          nom: string
          ordre: number
          updated_at: string
        }
        Insert: {
          champs_standards?: Json
          code: string
          created_at?: string
          description?: string | null
          id?: string
          nom: string
          ordre?: number
          updated_at?: string
        }
        Update: {
          champs_standards?: Json
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          nom?: string
          ordre?: number
          updated_at?: string
        }
        Relationships: []
      }
      produits: {
        Row: {
          caracteristiques: Json
          cible: string | null
          code_produit: string | null
          commission_taux: number | null
          compagnie_id: string
          created_at: string
          created_by: string | null
          description: string | null
          famille_id: string
          id: string
          nom: string
          points_forts: string | null
          points_vigilance: string | null
          statut: Database["public"]["Enums"]["produit_statut"]
          updated_at: string
        }
        Insert: {
          caracteristiques?: Json
          cible?: string | null
          code_produit?: string | null
          commission_taux?: number | null
          compagnie_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          famille_id: string
          id?: string
          nom: string
          points_forts?: string | null
          points_vigilance?: string | null
          statut?: Database["public"]["Enums"]["produit_statut"]
          updated_at?: string
        }
        Update: {
          caracteristiques?: Json
          cible?: string | null
          code_produit?: string | null
          commission_taux?: number | null
          compagnie_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          famille_id?: string
          id?: string
          nom?: string
          points_forts?: string | null
          points_vigilance?: string | null
          statut?: Database["public"]["Enums"]["produit_statut"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produits_compagnie_id_fkey"
            columns: ["compagnie_id"]
            isOneToOne: false
            referencedRelation: "compagnies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produits_famille_id_fkey"
            columns: ["famille_id"]
            isOneToOne: false
            referencedRelation: "produit_familles"
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
      projets: {
        Row: {
          assigne_a: string | null
          client_id: string
          created_at: string
          created_by: string | null
          date_cloture_prevue: string | null
          etape: string
          id: string
          montant_estime: number | null
          notes: string | null
          probabilite: number
          produit: string | null
          titre: string
          updated_at: string
        }
        Insert: {
          assigne_a?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          date_cloture_prevue?: string | null
          etape?: string
          id?: string
          montant_estime?: number | null
          notes?: string | null
          probabilite?: number
          produit?: string | null
          titre: string
          updated_at?: string
        }
        Update: {
          assigne_a?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          date_cloture_prevue?: string | null
          etape?: string
          id?: string
          montant_estime?: number | null
          notes?: string | null
          probabilite?: number
          produit?: string | null
          titre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sinistres: {
        Row: {
          client_id: string
          contrat_id: string
          created_at: string
          created_by: string | null
          date_survenance: string | null
          description: string | null
          gestionnaire: string | null
          id: string
          montant: number | null
          reference: string | null
          statut: string
          type: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          contrat_id: string
          created_at?: string
          created_by?: string | null
          date_survenance?: string | null
          description?: string | null
          gestionnaire?: string | null
          id?: string
          montant?: number | null
          reference?: string | null
          statut?: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          contrat_id?: string
          created_at?: string
          created_by?: string | null
          date_survenance?: string | null
          description?: string | null
          gestionnaire?: string | null
          id?: string
          montant?: number | null
          reference?: string | null
          statut?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sinistres_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sinistres_contrat_id_fkey"
            columns: ["contrat_id"]
            isOneToOne: false
            referencedRelation: "contrats"
            referencedColumns: ["id"]
          },
        ]
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
      recalculer_echeances_contrat: {
        Args: { _contrat_id: string }
        Returns: undefined
      }
      trouver_taux_regle: {
        Args: {
          _beneficiaire_id: string
          _compagnie_id: string
          _date: string
          _famille_id: string
          _portee: string
          _produit_id: string
        }
        Returns: {
          assiette: string
          taux: number
        }[]
      }
    }
    Enums: {
      activite_type: "note" | "appel" | "email" | "sms" | "systeme" | "rdv"
      api_auth_type: "none" | "api_key" | "bearer" | "oauth2" | "basic"
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
      compagnie_statut: "actif" | "prospect" | "inactif"
      dossier_statut: "nouveau" | "en_cours" | "signe" | "perdu"
      produit_document_type:
        | "conditions_generales"
        | "ipid"
        | "fiche_produit"
        | "tarifs"
        | "autre"
      produit_statut: "actif" | "en_test" | "retire"
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
      api_auth_type: ["none", "api_key", "bearer", "oauth2", "basic"],
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
      compagnie_statut: ["actif", "prospect", "inactif"],
      dossier_statut: ["nouveau", "en_cours", "signe", "perdu"],
      produit_document_type: [
        "conditions_generales",
        "ipid",
        "fiche_produit",
        "tarifs",
        "autre",
      ],
      produit_statut: ["actif", "en_test", "retire"],
      tache_priorite: ["basse", "normale", "haute", "urgente"],
      tache_statut: ["a_faire", "en_cours", "terminee", "annulee"],
    },
  },
} as const
