-- Migration 007 : informations de contact du gestionnaire de projet
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS manager_name    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS manager_email   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS manager_phone   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS manager_role    VARCHAR(100);
